# Pipeline internals — extract -> define -> canonicalize

Purpose
- Provide a focused, implementation-oriented view of the core pipeline handoffs inside the EDC pipeline.
- Show the responsibilities of `orchestrator`, `extract.js`, `define.js`, `canonicalize.js`, and the short-lived `vectorStore` vs persistent `graphStore`.
- Include sample payload shapes, invariants, suggested instrumentation, and common extension points.

Overview
- The `orchestrator` (`src/pipeline/orchestrator.js`) is the conductor: it accepts parsed documents from the ingestion layer, schedules/executes pipeline stages, and aggregates results.
- `extract.js` performs local, deterministic extraction of candidate entities, relations, and attributes from parsed chunks.
- `define.js` synthesizes schema fragments and clusters/merges candidates; it uses `vectorStore` (`src/storage/vectorStore.js`) to embed items and perform nearest-neighbor similarity.
- `canonicalize.js` resolves identity, deduplicates, and prepares canonical nodes/edges for persistent writes into `graphStore` (`src/storage/graphStore.js`).
- `vectorStore` is ephemeral and scoped to a run/session; `graphStore` is authoritative and persistent.

Sequence diagram (Mermaid)
```Alaris Takehome/docs/diagrams/pipeline-internals.md#L1-200
sequenceDiagram
  autonumber
  participant Orch as `orchestrator.js`
  participant Loader as `pdfLoader` (ingestion)
  participant Extract as `extract.js`
  participant Define as `define.js`
  participant Vector as `vectorStore.js` (ephemeral)
  participant Canon as `canonicalize.js`
  participant Graph as `graphStore.js`
  participant Metrics as observability

  Loader->>Orch: push(parsedDocs)
  Orch->>Extract: runExtraction(parsedDocs)
  Extract-->>Orch: extractedFragments (candidates + contexts)
  Orch->>Define: runDefine(extractedFragments)
  Define->>Vector: upsert(embeddingVectors)
  Vector-->>Define: kNN(neighbors)
  Define-->>Orch: proposedSchemaFragments (merged clusters + mapping hints)
  Orch->>Canon: runCanonicalize(proposedSchemaFragments)
  Canon->>Graph: findOrCreate(canonicalNodes/edges)
  Graph-->>Canon: ack with canonicalIDs
  Canon-->>Orch: canonicalGraph (with resolved IDs)
  Orch->>Metrics: emit(stage latencies, counts, errors)
  Orch-->>Loader: runComplete(status)
```

Key message flow and data shapes
- The pipeline passes three main artifact types:
  1. parsed chunks (from `pdfLoader`) — small document segments with provenance metadata.
  2. extraction fragments (from `extract.js`) — candidate entities/relations with contextual evidence.
  3. proposed schema fragments / canonical graph (from `define.js` / `canonicalize.js`) — final upsertable nodes/edges.

Example: parsed chunk (shape)
```/dev/null/parsed_chunk.json#L1-40
{
  "documentId": "doc-123",
  "chunkId": "doc-123::p3::s1",
  "text": "Patient: John Doe\\nDOB: 1980-01-02\\nMed: Acetaminophen 500 mg",
  "page": 3,
  "provenance": {
    "source": "s3://bucket/files/doc.pdf",
    "offset": 1024
  }
}
```

Example: extraction fragment (shape)
```/dev/null/extraction_fragment.json#L1-60
{
  "fragmentId": "frag-789",
  "documentId": "doc-123",
  "candidates": [
    {
      "type": "Person",
      "value": "John Doe",
      "evidence": ["chunkId: doc-123::p3::s1", "matchSpan: 0-8"]
    },
    {
      "type": "Medication",
      "value": "Acetaminophen 500 mg",
      "evidence": ["chunkId: doc-123::p3::s1", "matchSpan: 31-52"]
    }
  ],
  "context": "Patient header block",
  "confidence": 0.92
}
```

Example: proposed canonical node (shape)
```/dev/null/canonical_node.json#L1-60
{
  "nodeId": null,             // null until persisted
  "type": "Person",
  "canonicalKey": "person:john-doe:1980-01-02",
  "properties": {
    "name": "John Doe",
    "dob": "1980-01-02"
  },
  "provenance": [
    {"documentId":"doc-123","chunkId":"doc-123::p3::s1","confidence":0.92}
  ],
  "sourceHints": ["extractionFragment:frag-789"]
}
```

Important invariants
- Deterministic canonical keys: `canonicalize.js` must compute deterministic keys (e.g., normalized name + DOB) to make upserts idempotent.
- Vector lifecycle: vectors upserted to `vectorStore` are tied to the current run identifier and must be deleted or expired after run completion.
- Provenance retention: every canonical node/edge must reference at least one source evidence item (`documentId`, `chunkId`, `fragmentId`) to enable traceability.

Instrumentation points (recommended)
- `orchestrator`:
  - emit per-stage start/end timestamps, success/failure counts, and batch sizes.
  - attach runId/sessionId to every emitted log.
- `extract.js`:
  - log extracted fragment counts and per-fragment confidence distribution.
- `define.js`:
  - record number of clusters merged, kNN query counts, and average neighbor distance thresholds.
- `canonicalize.js`:
  - log resolved canonical collisions and the conflict resolution strategy used.
- Storage adapters:
  - instrument `graphStore.upsert` latencies and result codes; keep slow-query traces for failed/deferred upserts.

Error handling and common failure modes
- Parsing failures (ingestion) → orchestrator should mark document as failed/retry depending on parser error type.
- Transient vector store errors → retry with exponential backoff inside `define.js`; do not escalate to persistent writes until define succeeds.
- Conflicting canonical writes → `canonicalize.js` must implement optimistic upsert with conflict detection and safe retry semantics; ensure monotonic provenance updates.
- Unrecoverable or ambiguous merges → surface to a manual review queue with attached evidence (store pointer to `fragmentId`s and `documentId`s).

Extension points
- Add a new ingestion parser: implement under `src/ingestion/` and ensure output matches existing parsed-chunk contract.
- Add a new extractor module: create another `extract.*.js` and register it with `orchestrator` for parallel extraction passes.
- Swap vector store backend: implement the same `vectorStore` API with a different provider but preserve ephemeral lifecycle semantics.

Where to read the code
- Orchestration: `src/pipeline/orchestrator.js`
- Extraction: `src/pipeline/extract.js`
- Schema synthesis: `src/pipeline/define.js`
- Canonicalization: `src/pipeline/canonicalize.js`
- Stores: `src/storage/vectorStore.js`, `src/storage/graphStore.js`
- Types: `src/types/schema.js`

Suggested small experiments
- Add a debug mode where `define.js` outputs intermediate clusters to disk for inspection (helpful when tuning cluster thresholds).
- Add a `dry-run` option in `orchestrator` that runs the pipeline without persisting to `graphStore` but still emits metrics.

If you need, I can add a companion diagram that shows sample read/write SQL or Postgres schema notes for the `graphStore`, or produce PNG/SVG exports of this sequence diagram for embedding in slide decks.