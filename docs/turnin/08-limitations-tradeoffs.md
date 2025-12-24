# Limitations and Trade-offs

What's implemented, what's not, and why.

## What's Implemented

✅ **Backend pipeline** for agentic graph construction  
✅ **Postgres schema** with pgvector for semantic search  
✅ **Proof-of-concept** demonstrating EDC + Integration workflows  
✅ **Beyond scope**: Agentic orchestration, advanced ingestion, provenance tracking

## What's Out of Scope

### Frontend
❌ No search interface  
❌ No graph visualization  
❌ No user authentication

**Why**: Assignment focused on backend. Future UI would use React + D3.js for graph visualization.

See [09-future-roadmap.md](./09-future-roadmap.md) for UI concepts.

### Production Scale
❌ No distributed processing  
❌ No caching layer  
❌ No monitoring/alerting

**Why**: Proof-of-concept prioritizes architecture over infrastructure. Production would need Kubernetes, Redis cache, and observability stack.

### Advanced Features
❌ No fine-tuned models  
❌ No incremental embedding updates  
❌ No conflict resolution UI

**Why**: Time constraints. These improve quality but aren't required for demonstrating core capabilities.

---

## Key Trade-offs

### 1. Prompting vs Fine-Tuning

**Chose**: Prompting with Gemini 2.0 Flash

**Trade-off**:
- ✅ **Flexibility**: Adapts to new paper types without retraining
- ❌ **Accuracy**: Fine-tuned models could achieve higher precision

**Rationale**: No labeled dataset for Gaussian Splatting papers. Prompting demonstrates generalization.

### 2. Postgres vs Neo4j

**Chose**: Postgres + Drizzle + pgvector

See [05-sql-schema.md](./05-sql-schema.md) for full schema and [07-design-rationale.md](./07-design-rationale.md) for rationale.

### 3. LLM-Based Resolution vs Rule-Based

**Chose**: LLM decides MERGE vs CREATE

See [04-integration-pipeline.md](./04-integration-pipeline.md) for implementation.

**Trade-off**:
- ✅ **Accuracy**: Understands semantic equivalence (e.g., "3DGS" = "3D Gaussian Splatting")
- ❌ **Cost**: LLM API calls per entity with candidates
- ❌ **Latency**: Slower than rule-based matching

**Rationale**: Entity resolution is critical for graph quality. KARMA showed LLM-based resolution outperforms rules.

### 4. Agentic vs Sequential Pipeline

**Chose**: Both modes (agentic recommended, legacy supported)

See [02-agent-implementation.md](./02-agent-implementation.md) for agentic details.

**Trade-off**:
- ✅ **Autonomy**: Agent discovers papers, avoiding manual selection
- ❌ **Complexity**: More code to maintain
- ❌ **LLM reliance**: Agent can make suboptimal decisions

**Rationale**: Demonstrates advanced orchestration while maintaining fallback for debugging.

---

## Known Limitations

### Processing Time
- WORST CASE: ~2-3 minutes per paper (due to serializal processing of LlamaParse + LLM extraction)
- 50 papers = ~2 hours

**Mitigation**: Batch parallel processing (already implemented in extraction pipeline, cutting time down by 10x, but finicky due to rate limits, can be parallelized 1000x under paid API tier)

### API Rate Limits
- OpenAlex: 10 req/sec (polite pool: 100 req/sec)
- Gemini: Subject to quota

**Mitigation**: Retry logic with exponential backoff

### Extraction Quality
- LLM hallucinations possible
- No human-in-the-loop validation

**Mitigation**: Debug artifacts enable manual inspection

### Corpus Coverage
- Focused on Gaussian Splatting (assignment requirement)
- Not tested on other domains

**Mitigation**: Architecture is domain-agnostic, but prompts tuned for CS papers

---

## Why These Choices?

**Goal**: Demonstrate solid architecture and thoughtful design, not production-ready scale.

**Priority**: 
1. Correctness (entity resolution, provenance)
2. Clarity (documented workflows, debug artifacts)
3. Extensibility (modular design, event-driven)

**Not priority**:
1. Performance optimization
2. UI polish
3. Multi-tenancy

This aligns with assignment scope: "proof-of-concept backend that extracts nodes and relationships."
