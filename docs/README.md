# Knowledge Graph Construction System

A modular backend system for extracting and constructing knowledge graphs from academic papers.

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

## Documentation Structure

| Section | Files |
|---------|-------|
| Backend Architecture & Pipelines | 01-04 |
| Database Schema | 05 |
| System Design & Roadmap | 06-09 |

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

- **Agentic orchestration** with ReACT reasoning
- **Multi-source ingestion** with OpenAlex + arXiv fallback
- **EDC pipeline** inspired by https://arxiv.org/pdf/2404.03868
- **KARMA architecture** inspired by https://arxiv.org/pdf/2502.06472
- **Provenance tracking** for all relationships
