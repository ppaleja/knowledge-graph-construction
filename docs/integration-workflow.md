# Integration Workflow Documentation


> **Agentic Context**: This workflow is automatically triggered by the `processPaper` tool after EDC completes. It handles the "Memory" aspect of the agent, merging new knowledge into the existing Long-Term Memory (Postgres).

This document outlines the integration workflow pipeline, which handles the merging of newly extracted knowledge graph data with the existing persisted graph.

## Workflow Overview

The workflow consists of three main phases:
1.  **Retrieve Candidates**: Fetch potential duplicate entities from the database.
2.  **Entity Resolution**: Use an LLM to decide whether to merge new entities with existing ones or create new ones.
3.  **Persist**: Save the resolved graph (entities and relationships) to the database.

## Mermaid Graph

```mermaid
graph TD
    %% Events
    EventStart([integrateEvent]) --> Step1
    
    %% Step 1: Retrieve Candidates
    subgraph Step1 [Step 1: Retrieve Candidates]
        direction TB
        S1_Start[Receive New Graph] --> S1_Loop[Loop through Entities]
        S1_Loop --> S1_Fetch[Fetch Similar from DB]
        S1_Fetch --> S1_Check{similar > 0?}
        S1_Check -- Yes --> S1_Add[Add to Candidates Map]
        S1_Check -- No --> S1_Next[Next Entity]
        S1_Add --> S1_Next
        S1_Next --> S1_Done{All Processed?}
        S1_Done -- No --> S1_Loop
        S1_Done -- Yes --> S1_Emit[Emit candidatesRetrievedEvent]
    end

    %% Transitions
    Step1 -->|candidatesRetrievedEvent| Step2
    Step1 -.->|Error| ErrorHandler

    %% Step 2: Entity Resolution
    subgraph Step2 [Step 2: Entity Resolution]
        direction TB
        S2_Start[Receive Candidates] --> S2_Import[Init Gemini LLM]
        S2_Import --> S2_Loop[Loop through Entities]
        S2_Loop --> S2_Check{Has Candidates?}
        
        %% No Candidates path
        S2_Check -- No --> S2_Create[Action: CREATE]
        S2_Create --> S2_MapIdentity[Map ID -> Same ID]
        
        %% Candidates path
        S2_Check -- Yes --> S2_Prompt[Prompt LLM with Entity & Candidates]
        S2_Prompt --> S2_Parse[Parse JSON Response]
        S2_Parse --> S2_Decision{Decision?}
        
        S2_Decision -- MERGE --> S2_Merge[Action: MERGE]
        S2_Decision -- CREATE --> S2_CreateLLM[Action: CREATE]
        
        S2_Merge --> S2_MapTarget[Map ID -> Target ID]
        S2_CreateLLM --> S2_MapIdentity
        
        S2_MapTarget --> S2_Next[Next Entity]
        S2_MapIdentity --> S2_Next
        
        %% Catch LLM errors
        S2_Parse -.->|Error| S2_Fallback[Fallback: CREATE]
        S2_Fallback --> S2_Next

        S2_Next --> S2_Done{All Processed?}
        S2_Done -- No --> S2_Loop
        
        %% Reconstruct Graph
        S2_Done -- Yes --> S2_Rebuild[Rebuild Graph with Resolved IDs]
        S2_Rebuild --> S2_ExtractRefs[Extract referencedEntityIds (Merge Targets)]
        S2_ExtractRefs --> S2_Emit[Emit entitiesResolvedEvent]
    end

    %% Transitions
    Step2 -->|entitiesResolvedEvent| Step3
    Step2 -.->|Error| ErrorHandler

    %% Step 3: Persistence
    subgraph Step3 [Step 3: Persist]
        direction TB
        S3_Save[Save Resolved Graph to DB] --> S3_Log[Log Stats]
        S3_Log --> S3_Emit[Emit integrationCompleteEvent]
    end

    %% Transitions
    Step3 -->|integrationCompleteEvent| EndSuccess([End: Success])
    Step3 -.->|Error| ErrorHandler

    %% Error Handling
    subgraph ErrorHandler [Error Handling]
        Err_Log[Log Error details] --> Err_Emit[Emit integrationCompleteEvent]
    end
    
    Err_Emit --> EndFail([End: Failed])

    %% Styling
    style Step1 fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    style Step2 fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style Step3 fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    style ErrorHandler fill:#ffebee,stroke:#b71c1c,stroke-width:2px
```

## Detailed Steps

### 1. Retrieve Candidates
*   **Input**: `newGraph` (from extraction), `paperPath`
*   **Logic**: 
    *   Iterates through every entity in the new graph.
    *   Generates a 768d vector embedding using Gemini (`@llamaindex/google`).
    *   Queries `DrizzleGraphStore` using `pgvector` Cosine Distance (`cosineDistance` < threshold) to find semantically similar entities.
*   **Output**: A `Map<string, Entity[]>` mapping new entity IDs to lists of existing similar entities from the DB.

### 2. Entity Resolution
*   **Input**: `newGraph`, `candidates`
*   **Logic**:
    *   Initialize Gemini LLM.
    *   For entities *without* candidates: Automatically marked as `CREATE`.
    *   For entities *with* candidates:
        *   Ask LLM: "Is this new entity the same as any of these candidates?"
        *   **MERGE**: If yes, map the new entity's ID to the existing entity's ID.
        *   **CREATE**: If no, keep the new entity as a distinct node.
    *   **Graph Rebuilding**:
        *   Filter out entities marked for MERGE (they are replaced by existing ones).
        *   Update all relationships to point to the resolved IDs (so relationships connect to the *merged* nodes correctly).
        *   **Referenced Entities**: Identify IDs that exist in the DB (merge targets) but are not in the current graph. Add them to `referencedEntityIds` to prevent orphan relationship errors during persistence.
*   **Output**: `resolvedGraph` (deduplicated, with valid `referencedEntityIds`), `mergeLog` (audit trail).

### 3. Persist
*   **Input**: `resolvedGraph`
*   **Logic**: 
    *   Validate relationships against both current `entities` and `referencedEntityIds`.
    *   Upsert nodes and insert relationships into the database using `DrizzleGraphStore`.
*   **Output**: emits `integrationCompleteEvent` with success status and stats.
