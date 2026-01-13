# Design Rationale

Key design decisions and their trade-offs.

## 1. Representing Data in the Graph

### Node Types
The `entities` table uses flexible typing via the `type` column:
- Paper, Method, Dataset, Metric, Technique, Concept

**Why not dynamic schema?** Chose static schema for to match Postgres convention. Favored ACID guarantees over Neo4j-style flexibility. 

### Edge Types
Semantic relationships via `relationships.type`:
- improves_on, evaluates, extends, uses, introduces, cites

**Provenance**: `sourcePaperId` tracks which paper asserted each relationship, enabling explainability.

### Semantic Relationships
Beyond citations - relationships capture conceptual connections (e.g., "Paper A improves on Method B by introducing Technique C").

---

## 2. Extracting Entities

### EDC Pipeline
Inspired by https://arxiv.org/pdf/2404.03868

**Extract → Define → Canonicalize** pattern provides iterative refinement, reducing LLM hallucinations and type inconsistencies.

See [03-extraction-pipeline.md](./03-extraction-pipeline.md) for implementation details.

### KARMA Multi-Agent Architecture
Inspired by https://arxiv.org/pdf/2502.06472

Our pipeline maps to KARMA's agent framework:

| KARMA Agent | Our Implementation |
|------------|-------------------|
| Reader Agents (RA) | LlamaParse segmentation |
| Summarizer Agents (SA) | PreParser (LlamaExtract metadata) |
| Entity Extraction Agents (EEA) | Extractor - entities first |
| Relationship Extraction Agents (REA) | Extractor - relationships second |
| Schema Alignment Agents (SAA) | Definer (type refinement) |
| Conflict Resolution Agents (CRA) | Integration workflow (similarity + LLM) |
| Evaluator Agents (EA) | Integration merge decisions |

**Why KARMA?** Demonstrated that:
1. **Two-stage extraction** (entities first, then relationships) improves accuracy
2. **Preparsing** (metadata before entities) focuses the model
3. **Conflict resolution** via semantic similarity + LLM significantly improves KG quality

### Validation
Integration workflow validates via:
- Semantic similarity (pgvector cosine distance)
- LLM-based merge decisions (MERGE vs CREATE)

See [04-integration-pipeline.md](./04-integration-pipeline.md) for entity resolution details.

### Why Prompting Over Fine-Tuning?
Chose prompting for flexibility. Fine-tuning could improve accuracy but requires labeled domain-specific data and reduces adaptability to new paper types. Confidence labels in `relationships` table allow for expert review and correction for future fine-tuning.

---

## 3. User Experience and Use Cases

### Core Use Cases
- **Semantic search**: Find papers/concepts by meaning, not just keywords
- **Citation crawling**: Discover related work via citation networks
- **Literature mapping**: Visualize how methods/datasets evolve across papers

### Example Queries
See [05-sql-schema.md](./05-sql-schema.md) for example queries:
- "Which papers improve on 3DGS?" → Relationship traversal
- "Find methods related to NeRF" → Semantic + keyword search

### Future Explainability
Graph structure enables insights like:
- "Paper B improves on Paper A by introducing concept X"
- "Method Y evaluates on Dataset Z with Metric W"

Provenance (`sourcePaperId`) allows tracing claims back to source papers.

### Agentic Construction
A ReACT agent enables autonomous graph building, allowing users to interact via natural language rather than manual paper selection.

---

## 4. Scalability and Maintenance

### Indexing
HNSW index on `entities.embedding` enables fast similarity search at scale (pgvector handles millions of vectors).

### Incremental Processing
Integration workflow merges new papers without rebuilding. Entity resolution ensures:
- No duplicate entities across papers
- Relationships reference canonical entities

### API Resilience
**OpenAlex "polite pool"**: Higher rate limits with `OPEN_ALEX_EMAIL`  
**arXiv fallback**: If OpenAlex lacks PDF, auto-resolve via arXiv API

### Future Scaling
- **Batch processing**: Process multiple papers concurrently
- **Distributed workers**: Separate ingestion, extraction, and integration workers. Currently workflows are modular to allow for easy scaling to multiple workers/batching.
- **Caching layer**: Cache embeddings and LLM responses
- **Incremental updates**: Process only new papers since last run

See [09-future-roadmap.md](./09-future-roadmap.md) for detailed scaling plans.

### Fault Tolerance
Event-driven workflows (`@llamaindex/workflow-core`) enable:
- Retry logic for LLM/API failures
- Debug artifacts for inspection
- Idempotent entity IDs for safe reprocessing

---

## Advanced Features

Beyond core functionality:

See [08-limitations-tradeoffs.md](./08-limitations-tradeoffs.md) for scope details.

### 1. Agentic Orchestration
A central controller with ReACT reasoning enables autonomous operation and autonomous paper discovery.

### 2. Advanced Ingestion
Multi-source fallback (OpenAlex → arXiv) and metadata extraction (LlamaExtract) show production-ready ingestion.

### 3. Provenance Tracking
Full paper-to-relationship lineage enables explainability and trust.

---

## Research Foundations

**EDC** (https://arxiv.org/pdf/2404.03868): Iterative refinement pattern  
**KARMA** (https://arxiv.org/pdf/2502.06472): Multi-agent architecture for scientific KG construction
