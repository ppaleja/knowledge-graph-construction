# Integration Pipeline

Merges newly extracted knowledge with the existing graph using semantic similarity and LLM-based entity resolution. Inspired by KARMA's Conflict Resolution and Evaluator agents (https://arxiv.org/pdf/2502.06472).

Runs after [03-extraction-pipeline.md](./03-extraction-pipeline.md) to merge graphs across papers.

See [07-design-rationale.md](./07-design-rationale.md) for design decisions.

## Workflow Phases

1. **Retrieve Candidates**: Vector similarity search for potential duplicates
2. **Entity Resolution**: LLM decides MERGE vs CREATE
3. **Persist**: Save resolved graph with valid relationships

## Workflow Diagram

```mermaid
graph TD
    Start([integrateEvent]) --> Retrieve
    
    subgraph Retrieve [Phase 1: Retrieve Candidates]
        R1[Receive New Graph] --> R2[Loop through Entities]
        R2 --> R3[Generate Embeddings<br/>Gemini 768d]
        R3 --> R4[pgvector Cosine Search]
        R4 --> R5{Similar Entities?}
        R5 -->|Yes| R6[Add to Candidates Map]
        R5 -->|No| R7[Continue]
        R6 --> R7
        R7 --> R8{All Processed?}
        R8 -->|No| R2
        R8 -->|Yes| R9[Emit candidatesRetrievedEvent]
    end
    
    Retrieve --> Resolve
    
    subgraph Resolve [Phase 2: Entity Resolution]
        E1[Receive Candidates] --> E2[Init Gemini LLM]
        E2 --> E3[Loop through Entities]
        E3 --> E4{Has Candidates?}
        E4 -->|No| E5[Action: CREATE]
        E4 -->|Yes| E6[Prompt LLM:<br/>Same entity?]
        E6 --> E7{Decision}
        E7 -->|MERGE| E8[Map ID to Target]
        E7 -->|CREATE| E9[Keep New ID]
        E5 --> E10[Next Entity]
        E8 --> E10
        E9 --> E10
        E10 --> E11{All Processed?}
        E11 -->|No| E3
        E11 -->|Yes| E12[Rebuild Graph<br/>with Resolved IDs]
        E12 --> E13[Extract Referenced Entities]
        E13 --> E14[Emit entitiesResolvedEvent]
    end
    
    Resolve --> Persist
    
    subgraph Persist [Phase 3: Persist]
        P1[Validate Relationships] --> P2[Upsert Entities]
        P2 --> P3[Insert Relationships]
        P3 --> P4[Emit integrationCompleteEvent]
    end
    
    Persist --> End([Success])
```

## Phase Details

### Retrieve Candidates
For each new entity:
- Generate 768d embedding using Gemini
- Query `entities` table using pgvector cosine distance (`< threshold`)
- Build `Map<entityId, candidateEntities[]>`

See [05-sql-schema.md](./05-sql-schema.md) for `entities` table structure and vector indexing.

### Entity Resolution (KARMA-inspired)
**Conflict Resolution Agent (CRA)**: Semantic similarity identifies candidates  
**Evaluator Agent (EA)**: LLM makes merge decisions

For each entity:
- **No candidates**: Automatically CREATE
- **Has candidates**: Ask LLM: "Is this new entity the same as any existing candidates?"
  - **MERGE**: Map new ID → existing ID
  - **CREATE**: Keep as distinct entity

**Graph Rebuilding**:
- Filter out merged entities
- Update all relationships to use resolved IDs
- Track `referencedEntityIds` (merge targets not in current graph) to prevent orphan relationships

### Persist
- Validate relationships against `entities` + `referencedEntityIds`
- Upsert entities (idempotent)
- Insert relationships with `sourcePaperId` for provenance

## Why This Matters

Integration is what transforms a collection of document-level graphs into a unified knowledge graph. Without it, entities would duplicate across papers and relationships would be isolated.

KARMA demonstrated that multi-stage conflict resolution significantly improves KG quality - this implementation validates that approach.

See [08-limitations-tradeoffs.md](./08-limitations-tradeoffs.md) for why LLM-based resolution was chosen over rule-based.
