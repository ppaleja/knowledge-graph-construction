# Agentic Architecture

This document describes the high-level architecture of the **Central Controller** agent and its tool ecosystem.

## Overview

The `KnowledgeGraphBuilder` is a ReACT (Reason + Act) agent that autonomously efficiently builds knowledge graphs. Instead of a hardcoded linear script, it "thinks" about what to do next based on the state of the graph and the papers it discovers.

## Architecture Components

```mermaid
graph TB
    User[User Request] -->|--agent flag| Controller
    
    subgraph "Orchestrator Layer"
        Controller[Central Controller<br/>(Gemini 2.0 Flash)]
    end
    
    subgraph "Tool Layer"
        direction LR
        Search[searchPapers]
        Cite[getCitations]
        DL[downloadPaper]
        Process[processPaper]
        Query[queryKG]
        Stats[summarizeKG]
    end
    
    subgraph "Execution Layer"
        OpenAlex[(OpenAlex API)]
        EDC[EDC Workflow]
        Integration[Integration Workflow]
        DB[(Postgres KG)]
    end
    
    Controller --> Search
    Controller --> Cite
    Controller --> DL
    Controller --> Process
    Controller --> Query
    Controller --> Stats
    
    Search --> OpenAlex
    Cite --> OpenAlex
    DL --> OpenAlex
    
    Process --> EDC
    Process --> Integration
    
    EDC --> DB
    Integration --> DB
    Query --> DB
    Stats --> DB
```

## The Central Controller

Located in: `src/orchestrator/controller.ts`

The controller uses a **ReACT Loop**:
1.  **Thought**: Analyzes the current task and context.
2.  **Action**: Selects one of the available tools.
3.  **Observation**: receives the tool output.
4.  **Repeat**: Continues until the task is done.

### System Prompt Strategy
The system prompt guides the agent to:
*   Start with a broad search or a specific seed paper.
*   Prioritize highly-cited papers (using `citationCount`).
*   Expand the graph by following citations (`getCitations`).
*   Periodically check the graph stats (`summarizeKG`) to measure progress.

## Tools Ecosystem

The tools are designed to be "Workflow-Level" (coarse-grained) to prevent the agent from getting stuck in low-level details.

### 1. Discovery Tools
*   **`searchPapers(query, limit)`**: Finds papers via OpenAlex. Default sort is by relevance.
*   **`getCitations(paperId, limit)`**: Finds papers that cite a target paper. Crucial for "Citation Crawling".
*   **`downloadPaper(metadata)`**: Handless PDF retrieval, trying OpenAlex PDF URL first, then falling back to Arxiv.

### 2. Processing Tools
*   **`processPaper(path)`**: The "Heavy Lifter".
    *   Wraps the **EDC Workflow** (Load -> Extract -> Define -> Canonicalize).
    *   Wraps the **Integration Workflow** (Retrieve Candidates -> Resolve -> Persist).
    *   Returns structured stats (`entitiesExtracted`, `entitiesMerged`) so the agent knows if the paper added new value.

### 3. Analysis Tools
*   **`queryKnowledgeGraph(term)`**: Allows the agent to see if a concept ("NeRF") already exists to avoid redundant work.
*   **`summarizeKnowledgeGraph()`**: Provides high-level metrics (Total Entities, Top Types) for final reporting.

## Key Design Improvements

### OpenAlex Integration
We migrated from Semantic Scholar to **OpenAlex** for:
*   **Reliability**: Higher rate limits (especially with the polite pool).
*   **Coverage**: Excellent citation data.
*   **Arxiv Fallback**: If OpenAlex has metadata but no PDF, we auto-resolve the Arxiv PDF URL.

### I/O Compatibility
Legacy workflows (`edcWorkflow`, `integrationWorkflow`) were refactored to **return data** via events (`completeEvent`, `integrationCompleteEvent`). This allows the `processPaper` tool to capture the output programmatically, enabling the agent to "see" the result of its work.
