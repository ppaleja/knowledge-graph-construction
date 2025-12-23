# Runtime flow — single document run (with retries & observability)

Purpose
- Provide a focused runtime view for how a single document is processed from ingestion through to canonical persistence, including error handling, retry semantics, and observability touchpoints.
- This file contains a Mermaid flowchart plus concrete guidance on where to add instrumentation and how errors should be classified. The goal is to make the end-to-end runtime behavior explicit so you can reason about operational guarantees.

Mermaid diagram (flowchart)
```Alaris Takehome/docs/diagrams/runtime-flow.md#L1-120
flowchart TB
  Start([Start])
  Start --> Ingest[`pdfLoader: fetch + parse`]
  Ingest --> Validate{parsed ok?}
  Validate -- no --> RetryHandler[`orchestrator: retry/backoff`]
  RetryHandler --> CheckRetries{retries left?}
  CheckRetries -- yes --> Ingest
  CheckRetries -- no --> DeadLetter[Dead-letter / manual review]
  Validate -- yes --> Enqueue[`orchestrator: schedule/extract`]
  Enqueue --> Extract[`extract.js (The Dreamer)`]
  Extract --> ExtractOut[(extraction fragments)]
  ExtractOut --> Define[`define.js (The Architect)`]
  Define --> VectorUpsert[`vectorStore: upsert embeddings`]
  VectorUpsert --> kNN[`vectorStore: kNN / neighbors`]
  kNN --> Define
  Define --> Proposed[(proposed schema fragments)]
  Proposed --> Canonicalize[`canonicalize.js (The Librarian)`]
  Canonicalize --> GraphUpsert[`graphStore: findOrCreate / upsert`]
  GraphUpsert --> Success([Success])
  GraphUpsert -->|conflict| ConflictHandler[`canonicalize: resolve & retry upsert`]
  ConflictHandler --> GraphUpsert
  anyError{{Operation error}} --> RetryOrFail{transient?}
  Extract --> anyError
  Define --> anyError
  Canonicalize --> anyError
  anyError -- yes --> RetryHandler
  anyError -- no --> DeadLetter
  Success --> EmitMetrics[`orchestrator: emit metrics & logs`]
  DeadLetter --> EmitMetrics
  EmitMetrics --> End([End])
```

Overview of steps
1. Start / Trigger
   - A job trigger (CLI, queue message, or user action) leads to a single-document run. The `orchestrator` assigns a `runId` and attaches it to all downstream artifacts to make traces correlateable.

2. Ingest & Parse
   - `pdfLoader` reads the source (S3/local) and invokes a parser.
   - If parsing fails, the `orchestrator` classifies the error and either retries with backoff or sends the item to a dead-letter store with evidence for manual review.
   - Parsed chunks must follow the canonical parsed-chunk contract (see `docs/diagrams/ingestion-detail.md`).

3. Extraction
   - `extract.js` consumes parsed chunks and emits extraction fragments with provenance and confidence scores.
   - Extraction should be deterministic for the same input and attach `documentId`, `chunkId` and `fragmentId`.

4. Schema synthesis
   - `define.js` embeds fragments and upserts embeddings into `vectorStore` (namespaced by `runId`).
   - `define.js` uses kNN queries to find similar fragments and propose merged schema fragments. These proposals include merge hints and do not contain persistent IDs.

5. Canonicalization & Persist
   - `canonicalize.js` receives proposed schema fragments, computes deterministic `canonicalKey`s, and performs idempotent upserts into `graphStore`.
   - On conflict (concurrent upsert or differing data), `canonicalize.js` must implement a resolution strategy (e.g., merge properties, append provenance, or escalate ambiguous cases to the review queue).

6. Observability & Metrics
   - `orchestrator` should emit structured metrics and logs at each stage:
     - per-stage latency and counts
     - `runId`, `documentId`, `chunkId`, `fragmentId` in logs for traceability
     - error classification (transient vs permanent)
   - Emit metrics on `vectorStore` cleanup and `graphStore` upsert latencies.

Error handling semantics
- Transient errors (network glitches, temporary vector store timeouts) -> retry with exponential backoff inside `orchestrator`. Backoff policy and retry limits must be configurable.
- Permanent errors (corrupted PDF, irrecoverable parse failures, ambiguous merges that need human input) -> write a dead-letter entry containing:
  - `documentId`, `runId`, parser/extractor logs, sample chunk text, and reasons for failure.
- Conflict in `graphStore` upsert -> perform deterministic resolution:
  - Attempt optimistic-upsert (INSERT ... ON CONFLICT) and if conflict persists, fetch the current canonical record, compute a merged version deterministically, and retry the upsert within a transaction. If merging is ambiguous, write to review queue.

Short example: run metadata emitted to logs (suggested shape)
```/dev/null/run_metadata.json#L1-40
{
  "runId": "run-2025-06-22-abc",
  "documentId": "doc-2025-0001",
  "stage": "define",
  "event": "kNN_query",
  "durationMs": 124,
  "counts": {
    "fragments": 12,
    "neighborsAvg": 5
  },
  "status": "success"
}
```

Instrumentation checklist (minimum)
- Logs: structured JSON with `runId`, `documentId`, stage, operation, durationMs, outcome, and error details when applicable.
- Metrics:
  - stage.latency.{ingest,extract,define,canonicalize}
  - stage.counts.{extracted_fragments,proposed_fragments,canonical_upserts}
  - error.counts.{parse_errors,vector_errors,db_errors}
  - vectorstore.cleanup.count
- Traces: make sure propagation of `runId` across asynchronous boundaries (queues, job workers) is preserved.

Retries and idempotency guidance
- Idempotency keys: use `canonicalKey` for graph upserts and `chunkId` for parsed chunks. The orchestrator should log attempts and avoid double-processing by marking completed `runId` statuses in a short-lived run-state store.
- Retry backoff: exponential backoff with jitter (e.g., base 200ms, multiplier 2, max 30s, jitter 0.1–0.3). Cap attempts (configurable; e.g., 3–5 tries).
- Dead-letter handling: store minimal evidence necessary to reproduce and review. Link to original blob in object storage, not the entire file if large.

Operational playbook snippets
- If `graphStore` upsert failures spike:
  1. Check DB health and connection errors.
  2. Inspect `canonicalize` conflict rates; increase logging to capture conflicting canonical keys and evidence.
  3. If migrations recently ran, validate DDL (unique indexes, constraints).
- If `vectorStore` cleanup lags:
  1. Ensure namespacing by `runId` is in effect.
  2. Run manual namespace purge for stuck runs and monitor TTL enforcement.
  3. Consider moving to a vector backend with built-in TTL support.

Where to look in the repo
- `src/ingestion/pdfLoader.js` — ingestion & parse
- `src/pipeline/orchestrator.js` — run orchestration, retries, metrics
- `src/pipeline/extract.js` — extraction
- `src/pipeline/define.js` — synthesis & vector ops
- `src/pipeline/canonicalize.js` — identity resolution & upserts
- `src/storage/vectorStore.js` — ephemeral vector adapter
- `src/storage/graphStore.js` — Postgres graph adapter

Next steps I can take for you
- Generate a small "run simulator" script in `src/debug/` that runs a single document path through the pipeline in `dry-run` mode (no writes to `graphStore`) and emits metrics.
- Add template observability code (structured logger + metric emitter) that `orchestrator` and stages can import.
- Export this diagram as PNG/SVG and add it under `docs/diagrams/assets/` for quick visual consumption.

If you'd like one of those, tell me which and I'll produce it.