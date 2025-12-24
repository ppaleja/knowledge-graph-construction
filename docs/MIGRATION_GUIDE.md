# Database Migration Guide

## Schema Changes for Concurrency Safety

This guide explains how to update your existing database schema to include the new concurrency safety features.

## Changes Required

### 1. Add Version Column to Entities Table

The `entities` table now includes a `version` column for optimistic concurrency control.

**SQL Migration:**
```sql
-- Add version column with default value
ALTER TABLE entities 
ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- For existing rows, version will be set to 1
-- Future updates will increment this automatically
```

### 2. Add Unique Constraint to Relationships Table

The `relationships` table now enforces uniqueness on `(source_id, target_id, type)` to prevent duplicate relationships.

**SQL Migration:**
```sql
-- Remove any existing duplicate relationships first
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (
           PARTITION BY source_id, target_id, type 
           ORDER BY id
         ) as row_num
  FROM relationships
)
DELETE FROM relationships
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- Add unique constraint
ALTER TABLE relationships
ADD CONSTRAINT relationships_source_id_target_id_type_unique 
UNIQUE (source_id, target_id, type);
```

## Using Drizzle Kit

The recommended approach is to use Drizzle Kit to manage schema migrations:

### Step 1: Generate Migration

```bash
npx drizzle-kit generate
```

This will create a migration file in the `drizzle/` directory based on the schema changes in `src/storage/schema.ts`.

### Step 2: Review Migration

Check the generated migration file in `drizzle/` to ensure it matches the expected changes:
- `version` column added to `entities`
- Unique constraint added to `relationships`

### Step 3: Apply Migration

```bash
# For local development
npx drizzle-kit push

# OR for production (recommended)
npx drizzle-kit migrate
```

## Manual SQL Approach

If you prefer to apply migrations manually:

### Full Migration Script

```sql
-- ============================================
-- Migration: Add Concurrency Safety Features
-- Date: 2024-12-24
-- ============================================

BEGIN;

-- Step 1: Add version column to entities
ALTER TABLE entities 
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Step 2: Remove duplicate relationships (if any)
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (
           PARTITION BY source_id, target_id, type 
           ORDER BY id
         ) as row_num
  FROM relationships
)
DELETE FROM relationships
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);

-- Step 3: Add unique constraint to relationships
ALTER TABLE relationships
DROP CONSTRAINT IF EXISTS relationships_source_id_target_id_type_unique;

ALTER TABLE relationships
ADD CONSTRAINT relationships_source_id_target_id_type_unique 
UNIQUE (source_id, target_id, type);

COMMIT;
```

### Verification Queries

After applying the migration, verify the changes:

```sql
-- Check entities table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'entities'
ORDER BY ordinal_position;

-- Check relationships constraints
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'relationships';

-- Verify unique constraint details
SELECT constraint_name, column_name
FROM information_schema.constraint_column_usage
WHERE constraint_name = 'relationships_source_id_target_id_type_unique';
```

## Rollback (If Needed)

If you need to rollback the changes:

```sql
BEGIN;

-- Remove version column from entities
ALTER TABLE entities 
DROP COLUMN IF EXISTS version;

-- Remove unique constraint from relationships
ALTER TABLE relationships
DROP CONSTRAINT IF EXISTS relationships_source_id_target_id_type_unique;

COMMIT;
```

## Impact on Existing Data

### Entities
- **No data loss**: Existing entities will get `version = 1`
- **Behavior change**: Future updates will increment the version
- **Breaking change**: Code reading entities should handle the new `version` field

### Relationships
- **Potential data loss**: Duplicate relationships will be removed (if any exist)
- **Behavior change**: Duplicate relationship inserts will be silently skipped
- **No breaking change**: Code continues to work as before

## Testing After Migration

### Test 1: Version Increment

```sql
-- Check initial version
SELECT id, name, version FROM entities LIMIT 1;

-- Update entity (this should increment version)
UPDATE entities SET name = 'Updated Name' WHERE id = 'test-id';

-- Verify version incremented
SELECT id, name, version FROM entities WHERE id = 'test-id';
-- Expected: version should be 2
```

### Test 2: Relationship Uniqueness

```sql
-- Try to insert duplicate relationship
INSERT INTO relationships (source_id, target_id, type, description)
VALUES ('entity1', 'entity2', 'relates_to', 'Test')
ON CONFLICT (source_id, target_id, type) DO NOTHING;

-- Verify only one relationship exists
SELECT COUNT(*) FROM relationships 
WHERE source_id = 'entity1' 
  AND target_id = 'entity2' 
  AND type = 'relates_to';
-- Expected: 1
```

## Supabase-Specific Instructions

If using Supabase:

### Option 1: Supabase Dashboard

1. Go to SQL Editor in Supabase Dashboard
2. Paste the migration script
3. Run the script

### Option 2: Drizzle Kit with Supabase

```bash
# Ensure DATABASE_URL points to your Supabase database
# Format: postgresql://postgres:[password]@[host]/postgres

# Push schema changes
npx drizzle-kit push
```

### Option 3: Supabase CLI

```bash
# Create migration
supabase migration new add_concurrency_features

# Edit the migration file with the SQL above

# Apply migration
supabase db push
```

## Troubleshooting

### Issue: Duplicate Key Error on Relationships

**Symptoms:**
```
ERROR: duplicate key value violates unique constraint "relationships_source_id_target_id_type_unique"
```

**Solution:**
The unique constraint detected existing duplicates. Run the duplicate removal script:

```sql
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (
           PARTITION BY source_id, target_id, type 
           ORDER BY id
         ) as row_num
  FROM relationships
)
DELETE FROM relationships
WHERE id IN (
  SELECT id FROM duplicates WHERE row_num > 1
);
```

### Issue: Version Column Already Exists

**Symptoms:**
```
ERROR: column "version" of relation "entities" already exists
```

**Solution:**
This is not an error - the column already exists. Verify it has the correct default:

```sql
ALTER TABLE entities 
ALTER COLUMN version SET DEFAULT 1;

ALTER TABLE entities
ALTER COLUMN version SET NOT NULL;
```

## Next Steps

After successfully applying the migration:

1. ✅ Rebuild the application: `npm run build`
2. ✅ Test with a sample paper: `node dist/index.js data/papers/test.pdf --integrate`
3. ✅ Monitor logs for any concurrency-related warnings
4. ✅ Review the [Concurrency Safety Documentation](./CONCURRENCY_SAFETY.md)

## Support

For issues or questions:
- Check the [Concurrency Safety Documentation](./CONCURRENCY_SAFETY.md)
- Review Drizzle ORM documentation: https://orm.drizzle.team/
- Review PostgreSQL documentation: https://www.postgresql.org/docs/
