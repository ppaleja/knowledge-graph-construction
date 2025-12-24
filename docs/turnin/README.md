# Assignment Deliverables

This directory contains the submission materials for the Alaris Security take-home assignment.

## Navigation Guide

### 1. Backend Codebase Documentation

- **[01-backend-overview.md](./01-backend-overview.md)** - System architecture and technology stack
- **[02-agent-implementation.md](./02-agent-implementation.md)** - Agentic system design with ReACT agent
- **[03-extraction-pipeline.md](./03-extraction-pipeline.md)** - EDC workflow details
- **[04-integration-pipeline.md](./04-integration-pipeline.md)** - Graph merging and entity resolution

### 2. SQL Schema Definition

- **[05-sql-schema.md](./05-sql-schema.md)** - Postgres schema with example queries

### 3. System Documentation

- **[06-system-architecture.md](./06-system-architecture.md)** - High-level architecture with diagrams
- **[07-design-rationale.md](./07-design-rationale.md)** - Design decisions addressing 4 key considerations
- **[08-limitations-tradeoffs.md](./08-limitations-tradeoffs.md)** - Scope and trade-offs
- **[09-future-roadmap.md](./09-future-roadmap.md)** - Scaling and advanced features

## Assignment Requirements Mapping

| Deliverable | Files |
|------------|-------|
| Backend Codebase | 01-04 |
| SQL Schema Definition | 05 |
| Documentation | 06-09 |

## Running the System

**Agentic Mode** (Recommended):
```bash
npm run build && npm run start -- --agent "Build KG on Gaussian Splatting with 50 papers"
```

**Legacy Mode**:
```bash
npm run build && npm run start path/to/paper.pdf --integrate
```

## Key Features

- **Agentic orchestration** with ReACT reasoning (beyond assignment scope)
- **Multi-source ingestion** with OpenAlex + arXiv fallback
- **EDC pipeline** inspired by https://arxiv.org/pdf/2404.03868
- **KARMA architecture** inspired by https://arxiv.org/pdf/2502.06472
- **Provenance tracking** for all relationships
