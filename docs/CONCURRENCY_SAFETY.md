# Database Concurrency Safety

## Overview

This document describes the concurrency control mechanisms implemented to ensure safe concurrent database operations when multiple processes or agents are saving/querying data simultaneously.

## Implemented Safety Mechanisms

### 1. SERIALIZABLE Transaction Isolation

**Location:** `src/storage/drizzleStore.ts` - `saveGraph()` method

**Implementation:**
```typescript
await db.transaction(async (tx) => {
  // IMPORTANT: This must be the first statement in the transaction
  await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
  
  // ... rest of transaction operations
});
```

**Why this works:**
- PostgreSQL allows `SET TRANSACTION` as the first statement in a transaction block
- The isolation level applies to all subsequent operations in that transaction
- Drizzle's transaction wrapper ensures this executes before other operations

**Benefits:**
- Provides the strongest isolation level in PostgreSQL
- Prevents all concurrency anomalies:
  - Dirty reads
  - Non-repeatable reads
  - Phantom reads
  - Serialization anomalies
- Ensures transactions produce the same result as if executed sequentially

**Use Case:** Prevents race conditions when multiple processes try to save entities and relationships simultaneously.

### 2. Optimistic Concurrency Control (OCC)

**Location:** `src/storage/schema.ts` - `entities` table

**Implementation:**
```typescript
version: integer("version").notNull().default(1)
```

**Insert/Update Logic:**
```typescript
// For new entities (INSERT)
.values({ version: 1, ... })

// For existing entities (UPDATE on conflict)
.onConflictDoUpdate({
  set: {
    version: sql`${entities.version} + 1`,
    ...
  }
})
```

**How it works:**
- When inserting a NEW entity: version starts at 1
- When updating an EXISTING entity (conflict on id): version increments by 1
- The `onConflictDoUpdate.set` clause only executes when there IS a conflict

**Benefits:**
- Detects concurrent modifications to the same entity
- Version number increments with each update
- Allows applications to detect and handle conflicts
- Efficient for read-heavy workloads with infrequent conflicts

**Use Case:** When two processes try to update the same entity, the version column helps track changes and detect conflicts.

### 3. Unique Constraints for Relationships

**Location:** `src/storage/schema.ts` - `relationships` table

**Implementation:**
```typescript
uniqueRelationship: unique().on(table.sourceId, table.targetId, table.type)
```

**Insert Logic:**
```typescript
.onConflictDoNothing() // Skip duplicates based on unique constraint
```

**Benefits:**
- Prevents duplicate relationships in the database
- Atomic operation at database level
- Efficient handling of concurrent relationship inserts
- Avoids primary key violations

**Use Case:** When multiple processes extract the same relationship from different papers, only one instance is stored.

### 4. Atomic Operations

**Location:** `src/storage/drizzleStore.ts` - All database operations

**Implementation:**
- All entity and relationship operations use atomic SQL operations
- Single INSERT...ON CONFLICT statements for upserts
- Leverages PostgreSQL's internal locking mechanisms

**Benefits:**
- No race conditions for individual entity/relationship operations
- Database-level atomicity guarantees
- Efficient use of PostgreSQL's MVCC (Multi-Version Concurrency Control)

## Architecture Considerations

### Read-Only Operations

The `fetchSimilarEntities()` method is a read-only operation used for candidate retrieval during entity resolution. It does NOT require row-level locking because:

1. It's not part of a read-modify-write cycle in the same transaction
2. The actual modifications happen later in a separate SERIALIZABLE transaction
3. Using stale data for candidate retrieval doesn't compromise data integrity
4. The SERIALIZABLE transaction in `saveGraph()` handles any conflicts

### Transaction Boundaries

**Current Pattern:**
```
fetch candidates → resolve with LLM → save in SERIALIZABLE transaction
     ^                                         ^
     |                                         |
 read-only                              all writes here
```

This pattern is safe because:
- Candidate retrieval is advisory (for LLM decision-making)
- All actual data modifications happen in a single SERIALIZABLE transaction
- The transaction isolation level ensures consistency

### When to Use Row-Level Locking

Row-level locking with `FOR UPDATE` would be beneficial if we had:
- Read-modify-write operations in the same transaction
- Need to prevent other transactions from reading/modifying specific rows
- Booking systems or inventory management patterns

**Example (not currently implemented):**
```typescript
// If we needed to lock entities during resolution
await tx.select()
  .from(entities)
  .where(eq(entities.id, candidateId))
  .for("update") // Lock this row
```

## PostgreSQL-Specific Features Used

### MVCC (Multi-Version Concurrency Control)

PostgreSQL's MVCC allows:
- Readers don't block writers
- Writers don't block readers
- Each transaction sees a consistent snapshot of the database

### SERIALIZABLE Snapshot Isolation

PostgreSQL's SERIALIZABLE implementation:
- Uses predicate locking (detecting conflicts based on read/write patterns)
- More efficient than traditional 2PL (two-phase locking)
- May require transaction retries on serialization failures

## Best Practices Implemented

1. ✅ **Use appropriate isolation levels** - SERIALIZABLE for critical write operations
2. ✅ **Optimistic concurrency control** - Version columns for conflict detection
3. ✅ **Unique constraints** - Database-level deduplication
4. ✅ **Atomic operations** - Single SQL statements for upserts
5. ✅ **Transaction boundaries** - Minimized transaction scope
6. ✅ **Conflict handling** - onConflictDoNothing for idempotent operations

## Testing Concurrency

To test these mechanisms:

### 1. Concurrent Entity Updates
```bash
# Terminal 1
node dist/index.js data/papers/paper1.pdf --integrate

# Terminal 2 (run simultaneously)
node dist/index.js data/papers/paper2.pdf --integrate
```

Expected behavior:
- Both processes complete successfully
- No duplicate relationships
- Entity versions increment correctly
- SERIALIZABLE isolation prevents anomalies

### 2. Relationship Deduplication
```bash
# Process the same paper twice
node dist/index.js data/papers/paper1.pdf --integrate
node dist/index.js data/papers/paper1.pdf --integrate
```

Expected behavior:
- Second run skips duplicate relationships
- No database errors
- Idempotent operation

## Performance Considerations

### SERIALIZABLE Overhead

SERIALIZABLE transactions have higher overhead than READ COMMITTED:
- More conflict detection
- Potential for serialization failures requiring retries
- Trade-off: correctness vs. throughput

**Recommendation:** For this academic paper processing use case, correctness is more important than maximum throughput.

### Optimistic vs. Pessimistic Locking

Current implementation uses optimistic locking (version columns):
- Better for read-heavy workloads
- Lower contention
- Conflicts are rare in paper processing

If conflicts become frequent, consider:
- Pessimistic locking with FOR UPDATE
- Application-level queuing
- Batch processing strategies

## Future Enhancements

### 1. Retry Logic for Serialization Failures

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === '40001' && i < maxRetries - 1) { // serialization_failure
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
}
```

### 2. Conflict Resolution Strategies

For entity conflicts, implement custom resolution:
- Last-write-wins
- Merge strategies (combine metadata)
- User-defined resolution rules

### 3. Vector Similarity for Entity Resolution

Replace text-based matching with semantic similarity:
```typescript
// Use pgvector extension
.where(sql`embedding <=> ${queryEmbedding} < 0.3`)
```

### 4. Advisory Locks for Long-Running Operations

For paper processing that takes minutes:
```typescript
// Prevent duplicate processing of the same paper
await db.execute(sql`SELECT pg_advisory_lock(${paperId})`);
```

## References

- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html)
- [Drizzle ORM Transactions](https://orm.drizzle.team/docs/transactions)
- [Optimistic Concurrency Control](https://en.wikipedia.org/wiki/Optimistic_concurrency_control)
