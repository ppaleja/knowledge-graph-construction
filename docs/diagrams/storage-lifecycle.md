# Storage lifecycle — what gets stored where

Purpose
- Document the lifecycle and responsibilities of the two primary storage systems used by the pipeline:
  - `src/storage/vectorStore.js` — ephemeral vector index used during `define.js` schema synthesis.
  - `src/storage/graphStore.js` — authoritative persistent graph store (Postgres / `PostgresGraphStore`).
- Explain invariants, retention policies, upsert semantics and operational guidance so engineers can extend or replace backends safely.
- This file pairs with the other diagram markdown files in `docs/diagrams/` and contains both a diagram and concrete lifecycle guidance (no orphaned diagrams).

Mermaid diagram (storage lifecycle)
```Alaris Takehome/docs/diagrams/storage-lifecycle.md#L1-120
flowchart TD
  subgraph Ephemeral["Ephemeral (short-lived)"]
    V[vectorStore\n(src/storage/vectorStore.js)]
  end

  subgraph Pipeline["Pipeline (runtime)"]
    D[`src/pipeline/define.js`]
    C[`src/pipeline/canonicalize.js`]
    O[`src/pipeline/orchestrator.js`]
  end

  subgraph Persistent["Persistent (authoritative)"]
    G[graphStore\n(src/storage/graphStore.js)\n(Postgres)]
    Backup[(Backups / WAL / Snapshots)]
    DeadLetter[(Dead-letter / manual review)]
    Exports[(Exports / API / Reporting)]
  end

  subgraph External["External Systems"]
    S3[Raw files (S3 / blob)]
    Analytics[Analytics / BI]
  end

  S3 --> O
  O --> D
  D --> V
  V --> D
  D --> C
  C --> G
  G --> Backup
  G --> Exports
  C --> DeadLetter
  Exports --> Analytics

  classDef eph fill:#fff1f0,stroke:#ff7a7a;
  classDef pers fill:#f0fff4,stroke:#2dbf6e;
  class V eph;
  class G pers;
```

High-level explanation
- `vectorStore` is strictly ephemeral:
  - Purpose: hold embeddings and similarity indices for the duration of one synthesis run (or a short TTL).
  - Not authoritative: never copy raw vectors into `graphStore` as first-class persisted fields.
  - Lifecycle: create/upsert during `define.js`, query for kNN, then expire or delete at run end.
  - Examples of backends: in-memory FAISS, Annoy, Redis-based vector index, or a managed vector DB configured with automatic TTLs.
- `graphStore` is authoritative (persistent):
  - Purpose: store canonical nodes, edges, properties, stable IDs and provenance.
  - Upserts should be idempotent: `canonicalize.js` must compute deterministic keys so repeated runs produce the same `node_id` or merge behavior.
  - Must store provenance: each node/edge record keeps the origin `documentId`, `chunkId`, `fragmentId`, `confidence`, and a `createdAt` and `lastSeenAt` timestamp.
  - Support for auditing and rollback: WAL-based backups or logical dumps should be configured.

Data contracts and examples
- Minimal vector entry (ephemeral)
```/dev/null/vector_entry.json#L1-40
{
  "runId": "run-2025-06-22-abc",
  "vectorId": "vec-0001",
  "payloadRef": {
    "fragmentId": "frag-789",
    "documentId": "doc-123"
  },
  "embedding": [0.001, -0.12, ...],
  "metadata": {
    "type": "extractionFragment",
    "createdAt": "2025-06-22T14:01:00Z"
  }
}
```

- Canonical node (persistent)
```/dev/null/canonical_node.json#L1-80
{
  "nodeId": "person::a1b2c3",         // stable DB id assigned or resolved
  "canonicalKey": "person:john-doe:1980-01-02",
  "type": "Person",
  "properties": {
    "name": "John Doe",
    "dob": "1980-01-02"
  },
  "provenance": [
    {"documentId":"doc-123","chunkId":"doc-123::p3::s1","fragmentId":"frag-789","confidence":0.92}
  ],
  "createdAt": "2025-06-22T14:05:00Z",
  "lastSeenAt": "2025-06-22T14:05:00Z"
}
```

Lifecycle rules and recommended policies
- Vector store lifecycle
  - Scope: per-run or per-session. The `orchestrator` should generate a `runId` and pass it to `define.js` and `vectorStore` so all artifacts are namespaced.
  - TTL: automatically expire or delete vectors after run completion + short buffer (e.g., 1–24 hours depending on re-run needs).
  - Security: avoid persisting sensitive PII in vector metadata. If unavoidable, encrypt or avoid long-term retention.
- Graph store lifecycle
  - Upsert semantics:
    - Compute `canonicalKey` deterministically (normalization rules documented in `canonicalize.js`).
    - Use SQL `INSERT ... ON CONFLICT` or equivalent to implement `findOrCreate` semantics atomically.
    - On merge, append new provenance rather than overwriting (or maintain separate provenance table for audit).
  - Soft deletes and tombstones:
    - Prefer soft-deletes (a `deletedAt` timestamp) to allow safe rollbacks and auditing.
  - Versioning:
    - Consider versioning node/edge properties (append-only changes or a `version` column) for auditability.
- Retention & housekeeping
  - Ephemeral vectors: auto-delete; do not backup.
  - Provenance & canonical graph: retain indefinitely by default; apply data retention policies only if regulated.
  - Dead-letter store: persist evidence for manual review; keep pointer to original document and a snapshot of fragments.

Transactional considerations
- Two-phase semantics (recommended)
  - Local transaction for canonical upserts: within `canonicalize.js`, group related upserts in a single DB transaction when possible to avoid partial graph state.
  - Background reconciliation: if a long-running reconcile is required, mark initial writes as provisional and finalize once reconciliation completes to avoid inconsistent reads.
- Idempotency
  - Use deterministic keys for idempotent upserts; tie upserts to `canonicalKey`.
  - Attach `sourceRunId` to provenance entries so identical runs do not duplicate provenance history.
- Concurrency
  - Ensure DB constraints (unique indexes on `canonicalKey`) plus optimistic concurrency (e.g., `version` column) to detect and resolve race conditions.

Backups, migrations and recovery
- Backups
  - Regular full dumps + WAL archiving for point-in-time recovery (Postgres best practices).
  - Test restores periodically into staging to validate backup integrity.
- Migrations
  - Use a formal migrations tool (e.g., Drizzle migrations present in repository) and run migrations in a maintenance window with health checks.
  - When changing canonical key format, prepare a migration path that re-anchors existing nodes or preserves old keys as aliases.
- Recovery
  - Document recovery runbook: how to restore a DB snapshot, how to replay WAL to a target timestamp, how to re-run ingestion for affected documents.
  - For accidental deletion: use soft-delete tombstones and a recovery script to rehydrate nodes from provenance where possible.

Instrumentation, observability & alerts
- Metrics to emit
  - `graphstore.upsert.latency`, `graphstore.upsert.error.count`
  - `vectorstore.upsert.latency`, `vectorstore.query.latency`
  - `provenance.append.count`, `canonicalization.conflicts.count`
  - Retention sweeper metrics: `vectorstore.cleanup.count`, `vectorstore.cleanup.latency`
- Logs
  - Structured logs include `runId`, `documentId`, `fragmentId`, `canonicalKey`, `nodeId` and operation outcome.
- Alerts
  - Persistent storage errors (write failures) and high conflict rates should alert immediately.
  - Backup failure or missed backup windows must trigger paging.

Operational patterns & best practices
- Keep `vectorStore` lifecycle short and tied to the pipeline run. Make its behavior clearly documented in `src/storage/vectorStore.js`.
- `graphStore` should remain the single source of truth for canonical entities and provenance.
- Avoid copying embeddings into the persistent store unless a clear product use-case exists; if you do, store them encrypted and mark them with explicit retention policies.
- Provide a `dry-run` mode in `orchestrator` that runs canonicalization without committing to `graphStore` for safe local testing.
- Implement a manual-review process for ambiguous merges: write candidates to a `review_queue` table with evidence links rather than forcing a best-effort merge.

Where this belongs in the codebase
- `src/storage/vectorStore.js` — ephemeral vector client. Ensure it supports namespacing by `runId` and a bulk-delete/TTL API.
- `src/storage/graphStore.js` — Postgres adapter. Expose `findOrCreateNode`, `appendProvenance`, `upsertEdge`, `softDeleteNode`, and transactional helpers.
- `src/pipeline/define.js` — responsible for populating `vectorStore` and consulting it for similarity during synthesis.
- `src/pipeline/canonicalize.js` — responsible for computing `canonicalKey`, running `graphStore` upserts, and appending provenance.

Suggested small additions you can make
- Add a `runId` parameter to all `vectorStore` APIs and ensure the orchestrator passes it.
- Implement a `vectorStore.cleanup(runId)` operation invoked by the orchestrator after run completion.
- Add an automated job to prune expired vector namespaces every N hours and emit metrics for cleanup.
- Add a `provenance` table in Postgres separate from node properties to keep node tables small and make provenance queries cheaper.

If you want, I can:
- produce a concise SQL DDL sketch for `nodes`, `node_provenance`, and `edges` tables, or
- generate a small `vectorStore` adapter template that supports TTL and namespacing for `runId`.
