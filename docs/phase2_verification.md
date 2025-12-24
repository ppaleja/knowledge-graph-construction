# Phase 2 Verification Guide

## Evidence Vector Search is Working

Looking at your output, we can already see it's working:

```
[Integration] Found candidates for 25 entities
[Integration] MERGE: "NeuSG" → "neus" (confidence: 0.9)
[Integration] MERGE: "3D Gaussian Splatting" → "3d_gaussian_splatting" (confidence: 0.98)
[Integration] MERGE: "Mesh Extraction" → "surface_reconstruction" (confidence: 0.95)
```

**Key indicators:**
1. ✅ "Found candidates for 25 entities" - vector search retrieved similar entities from DB
2. ✅ Successful semantic merges (e.g., "NeuSG" matched to "neus" despite different spelling)

---

## Verification Methods

### 1. **Database Check - Confirm Embeddings Exist**
Run this SQL query in your Supabase dashboard:

```sql
SELECT id, name, embedding IS NOT NULL as has_embedding 
FROM entities 
LIMIT 10;
```

**Expected:** All rows should have `has_embedding = true`

---

### 2. **Check Embedding Dimensions**
```sql
SELECT name, array_length(embedding::float[], 1) as dimensions
FROM entities 
WHERE embedding IS NOT NULL
LIMIT 5;
```

**Expected:** All should show `dimensions = 768` (Gemini embeddings)

---

### 3. **Test Semantic Similarity Directly**

Create a test script `scripts/test_vector_search.ts`:

```typescript
import { db } from "../src/storage/index.js";
import { entities } from "../src/storage/schema.js";
import { cosineDistance, sql } from 'drizzle-orm';
import { generateEmbedding } from '../src/utils/embeddings.js';

async function test() {
    // Test: Can we find "NeRF" when searching for "Neural Radiance Fields"?
    const queryText = "Neural Radiance Fields";
    const queryEmbedding = await generateEmbedding(queryText);
    
    const distance = cosineDistance(entities.embedding, queryEmbedding);
    
    const results = await db
        .select({
            name: entities.name,
            type: entities.type,
            distance: distance
        })
        .from(entities)
        .orderBy(distance)
        .limit(5);
    
    console.log(`Searching for: "${queryText}"`);
    console.log("\nTop 5 Matches:");
    results.forEach((r, i) => {
        console.log(`${i+1}. ${r.name} (${r.type}) - distance: ${r.distance}`);
    });
    
    process.exit(0);
}

test();
```

Run:
```bash
npx ts-node scripts/test_vector_search.ts
```

**Expected:** Should find "NeRF", "Neural Radiance Fields", or similar entities at the top.

---

### 4. **Add Debug Logging to Integration Workflow**

Temporarily add this to `src/storage/drizzleStore.ts` in `fetchSimilarEntities`:

```typescript
// After the query
console.log(`[VectorSearch] Query: "${entity.name}"`);
candidates.slice(0, 3).forEach(c => {
    console.log(`  - ${c.name} (distance: ${c.distance})`);
});
```

Rebuild and run - you'll see actual similarity scores.

---

## What About the Orphan Relationships?

The orphan relationships are a separate issue from the integration workflow. They're coming from the EDC canonicalization step where entity IDs get merged but some relationships slip through. Your orphan filter is correctly catching them as a safety net.

To trace where "2dgs" went:
```sql
SELECT * FROM entities WHERE name ILIKE '%2d%';
```

It was likely merged into "2D Gaussian Splatting" during canonicalization.
