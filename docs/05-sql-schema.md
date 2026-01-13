# SQL Schema Definition

Postgres schema for knowledge graph storage using Drizzle ORM and pgvector.

See [06-system-architecture.md](./06-system-architecture.md) for how this fits into the overall system.

## Tables

### `documents`
Tracks processed papers.

```sql
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path TEXT NOT NULL,
    checksum TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);
```

### `entities`
Nodes in the knowledge graph.

```sql
CREATE TABLE entities (
    id TEXT PRIMARY KEY,                    -- Deterministic entity ID
    name TEXT NOT NULL,                     -- Entity name
    type TEXT NOT NULL,                     -- Entity type (Method, Dataset, etc.)
    description TEXT,                       -- Entity description
    aliases JSONB,                          -- Alternative names (text[])
    metadata JSONB,                         -- Additional structured data
    embedding VECTOR(768),                  -- pgvector for similarity search
    created_at TIMESTAMP DEFAULT NOW()
);

-- HNSW index for fast vector similarity search
CREATE INDEX embedding_idx ON entities 
USING hnsw (embedding vector_cosine_ops);
```

**Entity Types** (examples):
- Paper
- Method
- Dataset
- Metric
- Technique
- Concept

### `relationships`
Edges in the knowledge graph.

See [04-integration-pipeline.md](./04-integration-pipeline.md) for how relationships are validated during integration.

```sql
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                     -- Relationship type
    description TEXT,                       -- Relationship description
    confidence NUMERIC,                     -- Extraction confidence (0.0-1.0)
    source_paper_id TEXT,                   -- Provenance: which paper extracted this
    metadata JSONB,                         -- Additional data
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Relationship Types** (examples):
- improves_on
- evaluates
- extends
- uses
- introduces
- cites

## Example Queries

### Query 1: Which papers improve on 3DGS?

```sql
SELECT 
    e1.name as source_paper, 
    e2.name as target_paper,
    r.description
FROM relationships r
JOIN entities e1 ON r.source_id = e1.id
JOIN entities e2 ON r.target_id = e2.id
WHERE r.type = 'improves_on'
  AND (e2.name ILIKE '%3DGS%' OR e2.name ILIKE '%3D Gaussian Splatting%');
```

### Query 2: Find all methods related to NeRF

```sql
SELECT DISTINCT e.name, e.type, e.description
FROM entities e
WHERE e.type = 'Method'
  AND (
    e.name ILIKE '%NeRF%' 
    OR e.description ILIKE '%Neural Radiance%'
    OR e.aliases::text ILIKE '%NeRF%'
  );
```

### Query 3: Semantic similarity search for "real-time rendering"

```sql
-- Find entities semantically similar to a query embedding
SELECT 
    name, 
    type, 
    description,
    1 - (embedding <=> $1::vector) as similarity
FROM entities
WHERE 1 - (embedding <=> $1::vector) > 0.7  -- Threshold
ORDER BY embedding <=> $1::vector
LIMIT 10;
```
*Note: This query WILL NOT WORK in practice exactly like this, `$1` would be the 768d embedding vector of "real-time rendering"*

### Query 4: Citation network depth

```sql
-- Find papers citing the seminal 3DGS paper (depth=1)
WITH seed_paper AS (
    SELECT id FROM entities 
    WHERE name ILIKE '%3D Gaussian Splatting for Real-Time%'
    LIMIT 1
)
SELECT DISTINCT
    e.name,
    e.metadata->>'publication_year' as year,
    r.type as relationship_type
FROM relationships r
JOIN entities e ON r.source_id = e.id
JOIN seed_paper sp ON r.target_id = sp.id
WHERE r.type IN ('cites', 'improves_on', 'extends')
ORDER BY year DESC;
```

### Query 5: Most referenced entities

```sql
SELECT 
    e.name,
    e.type,
    COUNT(r.id) as reference_count
FROM entities e
JOIN relationships r ON e.id = r.target_id
GROUP BY e.id, e.name, e.type
ORDER BY reference_count DESC
LIMIT 20;
```

## Why Postgres?

While Postgres isn't a native graph database, it's production-proven for graph-like systems (e.g., Facebook's TAO). Benefits:

- **Mature tooling**: Drizzle ORM, migrations, backups
- **Vector search**: pgvector extension for semantic similarity
- **Transactions**: ACID guarantees for data integrity
- **Supabase**: Managed hosting with realtime capabilities

See [07-design-rationale.md](./07-design-rationale.md) for the full trade-off analysis (Postgres vs Neo4j).
