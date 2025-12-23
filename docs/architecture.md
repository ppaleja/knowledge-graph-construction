# Architecture — High-level overview

This file is the single high-level architecture document for the project. It explains where major logic lives and points you to dedicated diagram files that document the system dataflows. Diagrams are intentionally placed in their own Markdown files (under `docs/diagrams/`) so each diagram has its explanatory context — no orphaned diagrams.

If you want a single glance summary: ingestion -> extraction -> schema synthesis -> canonicalization -> persistent graph store. The `orchestrator` coordinates those stages and provides retries, batching and observability.

## Where to look in the codebase

- Entry point
  - `src/index.js` — bootstrapping and CLI / job runner.
- Ingestion
  - `src/ingestion/pdfLoader.js` — PDF ingestion and parser wrapper (LlamaParse or similar).
- Pipeline stages
  - `src/pipeline/orchestrator.js` — pipeline coordinator (retries, concurrency, metrics).
  - `src/pipeline/extract.js` — raw extraction stage ("The Dreamer").
  - `src/pipeline/define.js` — schema/ontology synthesis ("The Architect").
  - `src/pipeline/canonicalize.js` — deduplication and normalization ("The Librarian").
- Storage
  - `src/storage/vectorStore.js` — ephemeral vector store used during synthesis.
  - `src/storage/graphStore.js` — persistent graph store (Postgres / PostgresGraphStore wrapper).
- Types & docs
  - `src/types/schema.js` — JSDoc/type hints for schema objects passed between stages.

This file intentionally avoids embedding the diagrams themselves. Each diagram has its own Markdown file in `docs/diagrams/` that contains the Mermaid diagram and a short description of what the diagram documents and why it matters.

## Diagrams (each one lives in its own file)

- High-level system flow
  - File: `docs/diagrams/high-level.md`
  - Purpose: single-page overview showing ingestion → pipeline → storage. Use this for onboarding and architecture review.
- Pipeline internals (sequence)
  - File: `docs/diagrams/pipeline-internals.md`
  - Purpose: sequence diagram showing the handoff between `extract.js`, `define.js`, `canonicalize.js`, the ephemeral `vectorStore`, and `graphStore`.
- Ingestion → parsing → extraction detail
  - File: `docs/diagrams/ingestion-detail.md`
  - Purpose: shows how `pdfLoader` and the parser produce chunks and how `extract.js` consumes them.
- Storage lifecycle & interactions
  - File: `docs/diagrams/storage-lifecycle.md`
  - Purpose: explains what is stored ephemerally (vectors) vs persistently (graph) and the lifecycle for each artifact.
- Runtime flow for a single document (including retries and observability)
  - File: `docs/diagrams/runtime-flow.md`
  - Purpose: flowchart that includes error/retry paths, observability touchpoints, and lifecycle for a single run.

Each diagram file includes:
- The Mermaid diagram.
- A short textual explanation describing the actors, the data that flows, and any important invariants (e.g., "do not persist ephemeral vectors to the canonical graph", "canonical IDs are authoritative").
- Suggested follow-ups (where to add instrumentation, how to extend the flow, etc.).

## Design principles (brief)

- Single responsibility: ingestion, transformation, and persistence are separated into modules.
- Idempotency: canonicalization stage enforces stable IDs and upsert semantics before persistent writes.
- Ephemeral synthesis: vector operations are transient and scoped to a run/session to avoid polluting the canonical graph.
- Centralized orchestration: `orchestrator` manages retries, concurrency limits, and emits structured logs/metrics.

## How to use the diagrams

1. Open the files under `docs/diagrams/` in any editor that supports Mermaid rendering (or paste the Mermaid blocks into an online Mermaid live editor).
2. Each diagram file includes a short narrative; read that narrative before interpreting the diagram.
3. Use the high-level diagram (`high-level.md`) for onboarding, and the detailed diagrams for implementation or design work.

## Next steps I can take for you

- Produce the individual diagram files under `docs/diagrams/` (each containing Mermaid and explanatory text).
- Render each diagram to PNG/SVG and add them to `docs/diagrams/assets/`.
- Expand any diagram to include concrete function names, DB tables, or sample payload shapes.

Tell me which next step you prefer and I will implement it (e.g., "create the diagram files" or "generate PNGs and add them to docs").