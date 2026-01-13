# Future Roadmap

How to evolve this proof-of-concept to production.

See [08-limitations-tradeoffs.md](./08-limitations-tradeoffs.md) for current limitations addressed by these plans.

## Scaling Ingestion and Processing

### Distributed Pipeline
**Current**: Single-process sequential execution  
**Future**: Distributed workers with job queue

```
Queue System (BullMQ/Redis)
├── Ingestion Workers (discover + download papers)
├── Extraction Workers (EDC pipeline)
└── Integration Workers (merge into graph)
```

**Benefits**:
- Parallel processing of 100s of papers
- Fault isolation (failed papers don't block others)
- Horizontal scaling

### Incremental Updates
**Current**: Reprocess entire corpus  
**Future**: Process only new papers since last run

Track processed papers in `documents` table (see [05-sql-schema.md](./05-sql-schema.md)):
```sql
SELECT id FROM documents WHERE status = 'completed';
```

Poll OpenAlex for new papers weekly/monthly.

### Caching Layer
**Current**: Recompute embeddings and LLM responses  
**Future**: Redis cache for:
- Paper embeddings (768d vectors)
- LLM responses (extraction, resolution decisions)
- OpenAlex API responses

**Savings**: 60-80% reduction in API costs for reprocessing

### Batch Embedding
**Current**: One embedding API call per entity  
**Future**: Batch embedding generation

```typescript
// Current: N API calls
for (const entity of entities) {
  entity.embedding = await generateEmbedding(entity.name);
}

// Future: 1 API call
const embeddings = await generateEmbeddings(entities.map(e => e.name));
```

---

## User Interface and Visualization

See [06-system-architecture.md](./06-system-architecture.md) for current backend architecture these UIs would build on.

### Graph Explorer
Interactive D3.js force-directed graph:
- Nodes colored by entity type
- Edges labeled by relationship type
- Click to expand citation network
- Pan/zoom for large graphs

**Example**: Click "3D Gaussian Splatting" → visualize all papers that improve/extend/evaluate it

### Semantic Search Interface
Natural language queries:
- "Find papers that improve rendering speed"
- "What datasets are used to evaluate NeRF methods?"

Backend: Convert query to embedding → pgvector similarity search

### Paper Timeline
Chronological view of how methods evolve:
- Y-axis: Time (publication year)
- X-axis: Method category
- Edges: "improves_on" relationships

Reveals: Which methods gained traction when?

### Recommendation Engine
"Papers related to this one":
- Semantic similarity on abstracts
- Citation network proximity
- Shared entities/concepts

### Export Features
- GraphML export for Gephi analysis
- CSV export for citations
- JSON API for custom integrations

---

## Advanced Research Discovery Features

Builds on the knowledge graph structure described in [07-design-rationale.md](./07-design-rationale.md).

### Novelty Detection
Identify "orphan" entities (not connected to existing graph):
```sql
SELECT e.name, e.type
FROM entities e
LEFT JOIN relationships r ON e.id = r.source_id OR e.id = r.target_id
WHERE r.id IS NULL;
```

Surfaces: New concepts not yet integrated into mainstream research

### Trend Analysis
Track entity/relationship growth over time:
```sql
SELECT 
  DATE_TRUNC('year', created_at) as year,
  type,
  COUNT(*) as count
FROM entities
GROUP BY year, type
ORDER BY year DESC;
```

Reveals: Emerging research areas (e.g., "NeRF" spike in 2020)

### Gap Analysis
Find under-studied connections:
```sql
-- Find methods with no evaluation relationships
SELECT m.name
FROM entities m
WHERE m.type = 'Method'
  AND NOT EXISTS (
    SELECT 1 FROM relationships r
    WHERE r.source_id = m.id AND r.type = 'evaluates'
  );
```

Suggests: Research opportunities (methods needing benchmarks)

### Citation Impact Prediction
Use graph structure + temporal data to predict high-impact papers:
- Rapid citation growth
- Bridge papers (connect disconnected clusters)
- Novel method + dataset combinations

### Automated Literature Reviews
Agent-generated summaries:
1. User: "Summarize NeRF advancements in 2023"
2. Agent: Query graph for NeRF papers from 2023
3. Agent: LLM synthesizes key contributions

---

## Production Readiness

### Monitoring and Observability
- **Metrics**: Processing time, API latency, error rates
- **Logging**: Structured logs (JSON) with trace IDs
- **Alerting**: Threshold alerts for failures, slow queries

Tools: Datadog, Grafana, Sentry

### API Design
RESTful API for external integrations:
```
GET  /api/entities?type=Method&limit=50
GET  /api/entities/:id
GET  /api/entities/:id/relationships
POST /api/search (semantic search)
POST /api/papers (enqueue paper for processing)
```

GraphQL for flexible queries:
```graphql
query {
  entity(id: "gaussian-splatting") {
    name
    type
    relationships(type: "improves_on") {
      target {
        name
        description
      }
    }
  }
}
```

### Authentication and Authorization
- API keys for programmatic access
- OAuth for web UI
- Role-based access control (admin, reader)

### Data Quality
- Human-in-the-loop validation for uncertain extractions
- Confidence thresholds for auto-accept
- Audit logs for all graph modifications

### Deployment
- **Containerization**: Docker + Docker Compose
- **Orchestration**: Kubernetes for auto-scaling
- **CI/CD**: GitHub Actions for automated testing + deployment
- **Database**: Supabase Pro with automated backups
