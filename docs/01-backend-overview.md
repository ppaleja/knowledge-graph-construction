# Backend Overview

A TypeScript-based knowledge graph construction system for academic papers.

## Technology Stack

**Core**
- TypeScript (Node.js ESM)
- LlamaIndex (workflows, agents, tools)
- Google Gemini 2.0 Flash

**Database**
- Supabase (Postgres)
- Drizzle ORM
- pgvector extension for semantic similarity

**External APIs**
- OpenAlex API (paper discovery with polite pool)
- arXiv API (PDF fallback)
- LlamaParse (PDF parsing)
- LlamaExtract (metadata extraction)

## Execution Modes

See [02-agent-implementation.md](./02-agent-implementation.md) for detailed agentic architecture.

### Agentic Mode (Recommended)
```bash
npm run build && npm run start -- --agent "Build KG on Gaussian Splatting with 50 papers"
```

Autonomous agent discovers, downloads, and processes papers using ReACT reasoning loop.

### Legacy Mode
```bash
npm run build && npm run start path/to/paper.pdf --integrate
```

Direct pipeline execution on a single PDF.

## Directory Structure

```
src/
├── config/index.ts              # Environment variables
├── index.ts                     # Entry point
├── orchestrator/                # Agentic layer
│   ├── controller.ts            # ReACT agent
│   └── tools/                   # 6 orchestrator tools
├── ingestion/
│   ├── loader.ts                # PDF loading
│   └── collector.ts             # OpenAlex integration
├── pipeline/
│   ├── workflow/
│   │   ├── edcWorkflow.ts       # Extraction pipeline
│   │   └── integrationWorkflow.ts
│   ├── extract/
│   │   ├── index.ts             # Entity extraction
│   │   └── preParser.ts         # Metadata extraction
│   ├── define/index.ts          # Type refinement
│   └── canonicalize/index.ts    # Deduplication
└── storage/
    ├── drizzleStore.ts          # Drizzle + Supabase
    └── schema.ts                # Postgres schema
```

## Key Components

**Central Controller** (`src/orchestrator/controller.ts`)
- ReACT agent with 6 tools
- Autonomous paper discovery and processing
- Natural language interface

**EDC Pipeline** (`src/pipeline/workflow/edcWorkflow.ts`)
- Load → Pre-Parse → Extract → Define → Canonicalize → Save
- Inspired by https://arxiv.org/pdf/2404.03868
- See [03-extraction-pipeline.md](./03-extraction-pipeline.md) for detailed workflow

**Integration Workflow** (`src/pipeline/workflow/integrationWorkflow.ts`)
- Retrieve Candidates → Resolve → Persist
- Semantic deduplication across entire graph
- See [04-integration-pipeline.md](./04-integration-pipeline.md) for detailed workflow

**Storage** (`src/storage/drizzleStore.ts`)
- Single persistent Postgres store
- pgvector for semantic similarity
- Provenance tracking via `sourcePaperId`
- See [05-sql-schema.md](./05-sql-schema.md) for complete schema and example queries
