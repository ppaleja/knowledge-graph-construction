# Architecture — High-level overview

This file is the single high-level architecture document for the project. It explains where major logic lives and how the system is organized.

## Overview

The system builds knowledge graphs from academic papers through two execution modes:
1. **Agentic Mode** (recommended): Autonomous agent discovers and processes papers
2. **Legacy Mode**: Direct pipeline execution on single papers

**High-level flow**: Paper Discovery → PDF Loading → Extraction → Definition → Canonicalization → Integration → Persistent Graph Store

---

## Execution Modes

### Agentic Mode (Recommended)
```bash
node dist/index.js --agent "Build a KG on Gaussian Splatting with 10 papers"
```

- Uses Central Controller (ReACT agent)
- Autonomously discovers, downloads, and processes papers
- Leverages 6 orchestrator tools
- Provides natural language interface
- See [agentic-architecture.md](./agentic-architecture.md) for details

### Legacy Mode
```bash
node dist/index.js path/to/paper.pdf --integrate
```

- Runs EDC workflow directly on single PDF
- Optional `--integrate` flag merges with existing graph
- Useful for debugging individual papers

---

## Technology Stack

### Core
- **Language**: TypeScript (Node.js ESM)
- **LLM Framework**: LlamaIndex (workflows, agents, tools)
- **LLM Provider**: Google Gemini 2.0 Flash

### Database
- **Database**: Supabase (Postgres)
- **ORM**: Drizzle ORM
- **Vector Search**: pgvector extension
- **Migrations**: drizzle-kit

### External APIs
- **Paper Discovery**: OpenAlex API (with polite pool)
- **PDF Parsing**: LlamaParse (with pdf-parse fallback)
- **Metadata Extraction**: LlamaExtract

---

## Directory Structure

```
src/
├── config/
│   └── index.ts              # Centralized environment variables
├── index.ts                  # Entry point (supports --agent and legacy modes)
├── orchestrator/             # Agentic layer (NEW)
│   ├── controller.ts         # Central ReACT agent
│   └── tools/                # 6 orchestrator tools
│       ├── paperDiscovery.ts # searchPapers, getCitations, downloadPaper
│       ├── processPaper.ts   # processPaper (wraps EDC + Integration)
│       └── queryKG.ts        # queryKnowledgeGraph, summarizeKnowledgeGraph
├── ingestion/
│   ├── loader.ts             # PDF loading (LlamaParse + fallback)
│   └── collector.ts          # OpenAlex API integration
├── pipeline/
│   ├── workflow/
│   │   ├── edcWorkflow.ts    # EDC event-driven workflow
│   │   └── integrationWorkflow.ts  # Integration workflow
│   ├── extract/
│   │   ├── index.ts          # Entity/relationship extraction
│   │   └── preParser.ts      # LlamaExtract metadata extraction
│   ├── define/
│   │   └── index.ts          # Type refinement
│   └── canonicalize/
│       └── index.ts          # Intra-document deduplication
├── storage/
│   ├── drizzleStore.ts       # Drizzle ORM + Supabase client
│   ├── schema.ts             # Postgres schema (entities, relationships)
│   └── index.ts              # Database connection
├── types/
│   ├── domain.ts             # Core domain types (Entity, Relationship, GraphData)
│   └── interfaces/           # Interface definitions
└── utils/
    ├── embeddings.ts         # Vector embedding generation
    ├── llm.ts                # LLM initialization
    └── resilience.ts         # Retry logic
```

---

## Where to Look in the Codebase

### Entry Points
- **Main**: [src/index.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/index.ts) - Supports `--agent` (agentic) and legacy modes
- **Agentic Controller**: [src/orchestrator/controller.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/orchestrator/controller.ts) - ReACT agent with system prompt

### Ingestion
- **PDF Loading**: [src/ingestion/loader.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/ingestion/loader.ts) - LlamaParse with fallback to pdf-parse
- **Paper Discovery**: [src/ingestion/collector.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/ingestion/collector.ts) - OpenAlex API integration

### Orchestrator (Agentic Layer)
- **Controller**: [src/orchestrator/controller.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/orchestrator/controller.ts) - Central ReACT agent
- **Tools**: [src/orchestrator/tools/](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/orchestrator/tools/)
  - `paperDiscovery.ts` - searchPapers, getCitations, downloadPaper
  - `processPaper.ts` - processPaper (wraps EDC + Integration workflows)
  - `queryKG.ts` - queryKnowledgeGraph, summarizeKnowledgeGraph

### Pipeline Stages (EDC Workflow)
- **Workflows**: [src/pipeline/workflow/](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/pipeline/workflow/) - Event-driven workflows
  - `edcWorkflow.ts` - Load → Pre-Parse → Extract → Define → Canonicalize → Save
  - `integrationWorkflow.ts` - Retrieve Candidates → Resolve → Persist
- **Pre-Parse**: [src/pipeline/extract/preParser.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/pipeline/extract/preParser.ts) - LlamaExtract metadata extraction
- **Extract**: [src/pipeline/extract/index.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/pipeline/extract/index.ts) - Entity and relationship extraction
- **Define**: [src/pipeline/define/index.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/pipeline/define/index.ts) - Type refinement and definition
- **Canonicalize**: [src/pipeline/canonicalize/index.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/pipeline/canonicalize/index.ts) - Intra-document deduplication

### Storage
- **Store**: [src/storage/drizzleStore.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/storage/drizzleStore.ts) - Drizzle ORM + Supabase client
- **Schema**: [src/storage/schema.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/storage/schema.ts) - Postgres tables with pgvector
- **Config**: [src/config/index.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/config/index.ts) - Centralized environment variables

### Types
- **Domain Types**: [src/types/domain.ts](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/types/domain.ts) - Entity, Relationship, GraphData
- **Interfaces**: [src/types/interfaces/](file:///Users/pawanpaleja/VScodeProjects/alaris-takehome/src/types/interfaces/) - Pipeline and storage interfaces

---

## Architecture Diagrams

Key diagrams are embedded in the following documents:

- **System Overview**: [agentic-architecture.md](./agentic-architecture.md)
  - Central Controller architecture
  - Tool ecosystem
  - Data flow from user request to persistent storage

- **Pipeline Details**: 
  - [edc-workflow.md](./edc-workflow.md) - Extraction → Definition → Canonicalization pipeline
  - [integration-workflow.md](./integration-workflow.md) - Graph merging and entity resolution

- **Tool Definitions**: [agentic-flows.md](./agentic-flows.md) - Orchestrator tools and workflows

---

## Design Principles

- **Event-Driven Workflows**: Uses `@llamaindex/workflow-core` for pipeline orchestration
- **Single Persistent Store**: Drizzle + Supabase with pgvector (no separate ephemeral vector store)
- **Idempotency**: Entity IDs are deterministic for safe re-processing
- **Provenance Tracking**: All relationships track `sourcePaperId` for traceability
- **Agentic Reasoning**: Central Controller uses ReACT loop (Reason → Act → Observe)

---

## Storage Architecture

### Database Schema (Simplified)

**Entities Table**:
```typescript
{
  id: text (PK)              // Deterministic entity ID
  name: text                 // Entity name
  type: text                 // Entity type (e.g., "Method", "Dataset")
  description: text          // Entity description
  aliases: text[]            // Alternative names
  metadata: jsonb            // Additional structured data
  embedding: vector(768)     // pgvector embedding for similarity search
}
```

**Relationships Table**:
```typescript
{
  sourceId: text (FK)        // Source entity ID
  targetId: text (FK)        // Target entity ID
  type: text                 // Relationship type
  description: text          // Relationship description
  sourcePaperId: text        // Provenance: which paper extracted this
  confidence: text           // Extraction confidence
  metadata: jsonb            // Additional data
}
```

### Vector Search
- **Embeddings**: Stored directly in `entities.embedding` column (768-dimensional)
- **Similarity Search**: Uses pgvector's cosine distance for entity resolution
- **No Ephemeral Store**: All embeddings are persistent (no TTL or cleanup needed)

---

## Key Workflows

### EDC Pipeline (Extraction → Definition → Canonicalization)
See [edc-workflow.md](./edc-workflow.md) for detailed flow.

**Stages**:
1. **Load**: Parse PDF to text (LlamaParse)
2. **Pre-Parse**: Extract structured metadata (LlamaExtract)
3. **Extract**: Identify entities and relationships (LLM)
4. **Define**: Refine types and definitions (LLM)
5. **Canonicalize**: Deduplicate within document
6. **Save**: Persist to database

**Debug Artifacts**: `debug/00_preparsed.json`, `debug/01_extraction.json`, `debug/02_definition.json`, `debug/03_canonicalization.json`

### Integration Workflow (Graph Merging)
See [integration-workflow.md](./integration-workflow.md) for detailed flow.

**Phases**:
1. **Retrieve Candidates**: Vector search for similar entities
2. **Entity Resolution**: LLM decides MERGE vs CREATE
3. **Persist**: Save resolved graph with updated relationships

---

## Next Steps

For implementation details and code-level documentation:
- See individual workflow documentation ([edc-workflow.md](./edc-workflow.md), [integration-workflow.md](./integration-workflow.md))
- Review [agentic-architecture.md](./agentic-architecture.md) for orchestrator details
- Check source files directly (all paths linked above)