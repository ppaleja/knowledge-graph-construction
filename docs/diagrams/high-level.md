# High-level system diagram

Purpose
- Provide a single-page, high-level overview of how documents move through the system from ingestion to persistent storage.
- Show the major components and where each lives in the codebase so readers can quickly map concepts to implementation.
- This file contains the Mermaid diagram plus a short narrative explaining the actors and key notes. For implementation-level details, see the companion diagram files in this directory.

Mermaid diagram (paste into a Mermaid renderer or open this file in an editor with Mermaid support)
```Alaris Takehome/docs/diagrams/high-level.md#L1-80
flowchart LR
  subgraph Source["Source / Trigger"]
    U[User / CLI / Job Trigger]
    Files[PDF / Document Storage]
    U --> Files
  end

  subgraph Ingestion["Ingestion"]
    P[`src/ingestion/pdfLoader.js`]
    Files --> P
    P --> Parsed[Parsed document chunks]
  end

  subgraph Pipeline["EDC Pipeline"]
    O[`src/pipeline/orchestrator.js`]
    Extract[`src/pipeline/extract.js\n(The Dreamer)`]
    Define[`src/pipeline/define.js\n(The Architect)`]
    Canon[`src/pipeline/canonicalize.js\n(The Librarian)`]
    Parsed --> O
    O --> Extract
    Extract --> Define
    Define --> Canon
  end

  subgraph Storage["Storage & Outputs"]
    Vector[`src/storage/vectorStore.js\n(ephemeral)`]
    Graph[`src/storage/graphStore.js\n(Postgres persistent)`]
    Canon --> Graph
    Define --> Vector
    Vector --> Define
    Graph --> Exports[Reporting / API / Exports]
  end

  U --> O
  style Source fill:#f3f4f6,stroke:#333,stroke-width:1px
  style Ingestion fill:#eef2ff,stroke:#333,stroke-width:1px
  style Pipeline fill:#fef9c3,stroke:#333,stroke-width:1px
  style Storage fill:#e6ffed,stroke:#333,stroke-width:1px
```

Quick mapping (components -> files)
- Ingestion: `src/ingestion/pdfLoader.js` — reads PDFs and emits normalized parsed chunks.
- Orchestration: `src/pipeline/orchestrator.js` — accepts parsed chunks, coordinates stages (extraction, define, canonicalize), handles retries and batching.
- Extract stage: `src/pipeline/extract.js` — extracts candidate entities, attributes, and relations from chunks.
- Define stage: `src/pipeline/define.js` — synthesizes schema/ontology, leverages `vectorStore` for similarity/merging.
- Canonicalize stage: `src/pipeline/canonicalize.js` — deduplicates, normalizes, and prepares canonical graph writes.
- Vector store (ephemeral): `src/storage/vectorStore.js` — embeddings and kNN used only during synthesis; intended short-lived.
- Graph store (persistent): `src/storage/graphStore.js` — authoritative Postgres-backed store for canonical nodes/edges and provenance.

Key notes & invariants
- The `vectorStore` is ephemeral: do not persist intermediate vectors into the canonical graph.
- `canonicalize.js` should produce stable, deterministic IDs used for idempotent upserts into `graphStore`.
- `orchestrator.js` is the right place to implement observability (structured logs, metrics) and concurrency controls.
- To add a new ingestion source, implement a new loader under `src/ingestion/` that normalizes into the same parsed-chunk format.

How to render
- Copy the Mermaid block above into a Mermaid live editor or open this file in an editor that supports Mermaid previews.
- For implementation-level sequences and storage-lifecycle details, open the other files in this directory:
  - `docs/diagrams/pipeline-internals.md`
  - `docs/diagrams/ingestion-detail.md`
  - `docs/diagrams/storage-lifecycle.md`
  - `docs/diagrams/runtime-flow.md`

Suggested follow-ups
- Export this diagram to PNG/SVG and add under `docs/diagrams/assets/` for quick visual reference.
- Add short example payload shapes (JSON snippets) for the parsed chunks and canonical graph nodes in the pipeline-internals diagram.