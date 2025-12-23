# Ingestion detail — pdfLoader and parsing flow

Purpose
- Document the ingestion responsibilities and the exact contract between the ingestion layer and the pipeline.
- Show how `src/ingestion/pdfLoader.js` interacts with parsers (e.g., LlamaParse or other parsers), how parsed chunks are emitted, and what metadata/provenance is required.
- Provide sample parsed-chunk payloads, common error modes, and testing suggestions so you can validate implementations and integrate new parsers consistently.

Overview
- The ingestion layer is the system boundary for documents. It reads source files (PDFs, DOCX, etc.), runs a parser, and emits standardized parsed chunks that the pipeline consumes.
- The pipeline expects a stable parsed-chunk contract:
  - document-level metadata (id, source)
  - chunk-level id and offsets
  - a `text` field with normalized text
  - provenance info sufficient to trace the chunk back to the source file and byte/page offsets
- The ingestion module should be responsible for:
  - file acquisition (reading from disk, S3, or other storage)
  - invoking a parser (LlamaParse or other parser)
  - normalizing parser outputs (clean whitespace, normalize encodings)
  - chunking (if parser returns large segments, break into consistent chunk size)
  - deduplicating trivially identical chunks (configurable)
  - emitting parsed chunk objects to the orchestrator in the expected contract
  - surface parsing errors and classify them (transient vs permanent)

Mermaid diagram (ingestion -> parser -> parsed chunks)
```Alaris Takehome/docs/diagrams/ingestion-detail.md#L1-80
flowchart LR
  subgraph Source["Source Storage"]
    Files[PDF / DOCX / Blob Storage]
    Files --> Fetch[`pdfLoader: fetchFile()`]
  end

  subgraph Ingestion["Ingestion & Parse"]
    Fetch --> Parser[`pdfLoader: parseWith(LlamaParse / parser)`]
    Parser --> Normalize[`pdfLoader: normalizeChunks()`]
    Normalize --> Chunker[`pdfLoader: chunkAndAnnotate()`]
    Chunker --> Emit[`orchestrator.receiveParsedChunk(chunk)`]
  end

  subgraph Observability["Observability / Errors"]
    Parser -->|error| RetryHandler[`orchestrator: retry/backoff`]
    Parser -->|fatal| DeadLetter[`dead-letter store / manual review`]
    Emit --> Metrics[`orchestrator.metrics`]
  end

  style Source fill:#f3f4f6,stroke:#333,stroke-width:1px
  style Ingestion fill:#eef2ff,stroke:#333,stroke-width:1px
  style Observability fill:#fff4e6,stroke:#333,stroke-width:1px
```

Parsed-chunk contract (recommended canonical shape)
- Every parsed chunk must include the following fields. This contract is intentionally small so downstream stages can reliably use provenance and the text payload.

Example parsed chunk (JSON)
```/dev/null/parsed_chunk.json#L1-40
{
  "documentId": "doc-2025-0001",
  "chunkId": "doc-2025-0001::page-3::chunk-0",
  "text": "Patient: John Doe\nDOB: 1980-01-02\nMed: Acetaminophen 500 mg",
  "page": 3,
  "offset": {
    "byteStart": 1024,
    "byteEnd": 1150
  },
  "provenance": {
    "source": "s3://bucket/path/doc.pdf",
    "parser": "llamaparse-v0.2",
    "parseTime": "2025-06-01T12:34:56Z"
  },
  "metadata": {
    "mimeType": "application/pdf",
    "language": "en",
    "confidence": 0.97
  }
}
```

Chunking guidance
- Aim for chunks that are semantically coherent (paragraphs, table rows, header blocks).
- Keep chunk text lengths bounded (e.g., 500–1500 characters) to make later embedding or extraction predictable.
- Assign deterministic `chunkId`s derived from `documentId` + page + chunk index so re-processing the same file produces the same chunk identifiers.
- Include both page and byte offsets when possible to allow precise provenance and later highlighting for human review.

Parser normalization responsibilities
- Normalize whitespace and standardize newlines (LF).
- Remove or canonicalize non-informational headers/footers if feasible (configurable).
- Preserve semantic structure where possible (tables, key-value pairs) or expose a structured representation under `metadata.structure` when available.
- Provide `confidence` estimates where the parser can (helpful to downstream ranking decisions).

Error handling semantics
- Transient parsing errors (e.g., network timeouts, temporary parser failures) should be retried by `orchestrator` with exponential backoff. Logs should include `documentId` and an opaque `runId`.
- Non-transient errors (e.g., corrupted file format) should be written to a dead-letter location with full context and a pointer to the original file. Include parser error messages and a small sample of file bytes if helpful.
- Partial parses: if parser produces partial chunks, emit them but set a `metadata.partial: true` flag; downstream stages can choose to process or queue for reparse.

Operational notes & best practices
- Add a `--dry-run` mode to `pdfLoader` to validate the parser against a directory of test PDFs without persisting metrics or emitting to the orchestrator.
- Include a `maxChunkSize` and `minChunkSize` configuration so you can tune for your extraction and embedding costs.
- Emit structured logs from `pdfLoader` with: `documentId`, `numChunks`, `parseTimeMs`, `parserVersion`, and `parseError` (when present).
- Tag each emitted chunk with a `runId` or `sessionId` so that the orchestrator can correlate all chunks from a single ingestion run.

Testing recommendations
- Unit tests for:
  - deterministic `chunkId` generation
  - normalization functions (whitespace, encoding)
  - chunker splits on boundary cases (very long paragraphs, tables)
- Integration tests:
  - round-trip parse for representative PDF samples: ingest -> parse -> chunk -> validate parsed-chunk contract
  - error handling tests that simulate timeouts, corrupt files, and parser exceptions
- Property tests:
  - re-ingesting the same file results in the same number of chunks and identical `chunkId`s (idempotency)

Extensibility: supporting new parser backends
- Implement a small parser adapter interface in `pdfLoader`:
  - `parse(fileBuffer, options) -> Promise<Array<ParserResultChunk>>`
- Adapter responsibilities:
  - map backend-specific results into the canonical parsed-chunk contract
  - return parser metadata (`parserName`, `parserVersion`, `confidenceMetrics`)
- Add adapter tests to validate the mapping for each parser implementation (LlamaParse, pdfminer, tika, etc.).

Auditability and traceability
- Keep the original file checksum (`sha256`) in the `provenance` block for strong traceability.
- When feasible, store a tiny serialized sample of the parser raw output in debug logs or a short-term debug store for human troubleshooting (avoid storing large parser artifacts in the primary DB).

Checklist before deploying a new parser or parser config
- [ ] Parsed-chunk contract validated against the pipeline consumer (orchestrator).
- [ ] Deterministic `chunkId` generation implemented.
- [ ] Provenance fields (`source`, `parser`, `parseTime`, `sha256`) present.
- [ ] Observability: parseTimeMs and chunk counts are emitted.
- [ ] Error classification: transient errors retriable; corrupt files go to dead-letter queue.
- [ ] Tests added (unit & integration) for representative files.

If you'd like, I can:
- Provide a ready-to-run `pdfLoader` adapter template showing the adapter interface and sample mapping code to the parsed-chunk contract.
- Produce a small test harness (shell+node script) that runs `pdfLoader` against the `data/` directory and asserts the parsed-chunk contract for each resulting item.