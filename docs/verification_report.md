# Documentation Verification Report
**Date**: 2025-12-24  
**Purpose**: Verify that documentation in `docs/` accurately reflects the current codebase design

---

## Executive Summary

The documentation has **significant discrepancies** with the current codebase. The project has evolved from the originally documented design to support:
1. **Agentic architecture** (not just sequential pipelines)
2. **TypeScript** (docs refer to `.js` files)
3. **Supabase/Drizzle** (docs mention generic Postgres)
4. **OpenAlex API** (docs mention Semantic Scholar)
5. **Provenance tracking** with `sourcePaperId`
6. **Pre-parsing stage** with LlamaExtract
7. **Vector embeddings** with pgvector (not a separate ephemeral vector store)

---

## Detailed Findings

### ✅ **ACCURATE Documentation**

#### 1. **EDC Workflow** (`docs/edc-workflow.md`)
- ✅ **Mermaid diagram flow** is mostly accurate
- ✅ **Step descriptions** match implementation (Load → Extract → Define → Canonicalize → Save)
- ✅ **Event-driven architecture** correctly documented
- ✅ **Debug artifacts** (`01_extraction.json`, etc.) are accurate
- ⚠️ **NEW**: Pre-parse step exists but not in diagram (saves `00_preparsed.json`)
- ⚠️ **File paths** reference `.js` but codebase uses `.ts`

#### 2. **Integration Workflow** (`docs/integration-workflow.md`)
- ✅ **Three-phase structure** is accurate (Retrieve → Resolve → Persist)
- ✅ **Vector similarity search** correctly described
- ✅ **LLM-based entity resolution** accurately documented
- ✅ **Referenced entities** concept is correct
- ✅ **Mermaid diagram** matches implementation

#### 3. **Agentic Architecture** (`docs/agentic-architecture.md`)
- ✅ **Central controller pattern** is accurate
- ✅ **Tool ecosystem** (6 tools) is correctly listed
- ✅ **ReACT loop** explanation is correct
- ✅ **System prompt strategy** matches `src/orchestrator/controller.ts`
- ✅ **OpenAlex migration** is documented
- ✅ **I/O compatibility** (returning data via events) is accurate

#### 4. **Agentic Flows** (`docs/agentic-flows.md`)
- ✅ **Tool definitions table** is accurate
- ✅ **Example workflow** matches agent behavior
- ✅ **Tool status** (all implemented) is correct

---

### ❌ **INACCURATE / OUTDATED Documentation**

#### 1. **Architecture Overview** (`docs/architecture.md`)
**Problem**: References legacy file structure that no longer exists

| Document Reference | Reality | Status |
|-------------------|---------|--------|
| `src/index.js` | ✅ `src/index.ts` exists | ⚠️ Wrong extension |
| `src/ingestion/pdfLoader.js` | ✅ `src/ingestion/loader.ts` exists | ⚠️ Wrong name/extension |
| `src/pipeline/orchestrator.js` | ❌ Does NOT exist | ❌ MISSING |
| `src/pipeline/extract.js` | ❌ Does NOT exist (now `src/pipeline/extract/index.ts`) | ❌ WRONG |
| `src/pipeline/define.js` | ❌ Does NOT exist (now `src/pipeline/define/index.ts`) | ❌ WRONG |
| `src/pipeline/canonicalize.js` | ❌ Does NOT exist (now `src/pipeline/canonicalize/index.ts`) | ❌ WRONG |
| `src/storage/vectorStore.js` | ❌ Does NOT exist | ❌ MISSING |
| `src/storage/graphStore.js` | ❌ Does NOT exist (now `src/storage/drizzleStore.ts`) | ❌ WRONG |
| `src/types/schema.js` | ❌ Does NOT exist (now multiple files in `src/types/`) | ❌ WRONG |

**Impact**: High - This is the main architecture document and it's severely outdated.

**Actual Structure**:
```
src/
├── config/
├── index.ts ✅ (entry point)
├── ingestion/
│   ├── collector.ts (NEW - OpenAlex API)
│   └── loader.ts (PDF loading)
├── orchestrator/ (NEW - Agentic layer)
│   ├── controller.ts
│   └── tools/
├── pipeline/
│   ├── canonicalize/index.ts
│   ├── define/index.ts
│   ├── extract/
│   │   ├── index.ts (Extractor)
│   │   └── preParser.ts (NEW - LlamaExtract)
│   └── workflow/
│       ├── edcWorkflow.ts
│       └── integrationWorkflow.ts
├── storage/
│   ├── drizzleStore.ts (Drizzle ORM + Supabase)
│   ├── schema.ts (Drizzle schema)
│   └── index.ts
└── types/
    └── domain.ts (type definitions)
```

---

#### 2. **High-Level Diagram** (`docs/diagrams/high-level.md`)
**Problems**:
1. ❌ Shows `orchestrator.js` as central component (does NOT exist)
2. ❌ Shows separate `vectorStore.js` (embeddings are in `drizzleStore.ts` with pgvector)
3. ❌ References `.js` files throughout
4. ⚠️ Missing **agentic controller layer** (new architecture)
5. ❌ Shows ingestion as separate from pipeline (now integrated via tools)

**What's Missing**:
- Central Controller (ReACT agent)
- Tool ecosystem (6 orchestrator tools)
- OpenAlex API integration
- Pre-parser stage

---

#### 3. **Pipeline Internals** (`docs/diagrams/pipeline-internals.md`)
**Problems**:
1. ❌ Shows `orchestrator.js` as conductor (does NOT exist)
2. ❌ Shows separate ephemeral `vectorStore` (embeddings stored in Postgres with pgvector)
3. ❌ File paths reference `.js` extensions
4. ⚠️ Missing pre-parse stage in sequence diagram
5. ⚠️ Missing `sourcePaperId` provenance tracking

**Reality**:
- No standalone orchestrator - workflows are event-driven via `@llamaindex/workflow-core`
- Vector embeddings stored directly in `entities` table (Supabase + pgvector)
- Pre-parser extracts structured metadata before extraction

---

#### 4. **Storage Lifecycle** (`docs/diagrams/storage-lifecycle.md`)
**Major Discrepancies**:

| Documentation | Current Implementation |
|--------------|------------------------|
| Separate ephemeral `vectorStore.js` | ❌ Does NOT exist |
| Vectors stored temporarily with TTL | ❌ Stored permanently in `entities.embedding` |
| `graphStore.js` (generic Postgres) | ✅ `drizzleStore.ts` (Drizzle ORM + Supabase) |
| Custom schema management | ✅ Drizzle migrations via `drizzle-kit` |
| `runId` scoping for vectors | ❌ Not implemented |

**Critical Misunderstanding**:
The docs describe an **ephemeral-then-persistent** two-store architecture, but the current implementation uses a **single persistent store** with pgvector embeddings saved alongside entities.

**Actual Storage Schema** (simplified):
```typescript
// src/storage/schema.ts
entities: {
  id: text (PK)
  name: text
  type: text
  description: text
  aliases: text[]
  metadata: jsonb
  embedding: vector(768) // pgvector - PERSISTENT, not ephemeral
}

relationships: {
  sourceId: text (FK)
  targetId: text (FK)
  type: text
  description: text
  sourcePaperId: text // NEW - provenance tracking
}
```

---

#### 5. **Ingestion Detail** (`docs/diagrams/ingestion-detail.md`)
**Likely Issues** (not verified in detail):
- ❌ References `pdfLoader.js` (actual: `loader.ts`)
- ⚠️ May not document LlamaExtract pre-parsing
- ⚠️ May not document OpenAlex integration for paper discovery

---

## Major Conceptual Gaps

### 1. **No Discussion of Agentic vs Legacy Modes**
The codebase supports TWO execution modes:
```bash
# Agentic (NEW)
node dist/index.js --agent "Build KG on topic X"

# Legacy (OLD)
node dist/index.js path/to/paper.pdf --integrate
```

This is **not documented** in architecture docs.

### 2. **OpenAlex API Integration**
- ✅ Mentioned in `agentic-architecture.md`
- ❌ NOT mentioned in main `architecture.md`
- Should document:
  - Paper discovery (`searchPapers`)
  - Citation network (`getCitations`)
  - PDF download with arXiv fallback
  - Polite pool usage

### 3. **Provenance Tracking**
- `sourcePaperId` field added to relationships
- Tracks which paper a relationship was extracted from
- **Not documented** in architecture or storage docs

### 4. **Pre-Parsing with LlamaExtract**
- New stage: `preParsedEvent` in EDC workflow
- Extracts structured metadata (title, authors, etc.) before entity extraction
- Saves `debug/00_preparsed.json`
- **Not in EDC workflow diagram**

### 5. **Configuration Centralization**
- New `src/config/index.ts` module
- Centralizes all environment variable access
- **Not documented**

---

## Recommendations

### 🔴 **Critical Updates Needed**

1. **Update `docs/architecture.md`**:
   - Fix all file paths to `.ts` extensions
   - Document actual directory structure
   - Remove references to `orchestrator.js`
   - Add section on agentic vs legacy modes
   - Explain Drizzle/Supabase stack

2. **Update `docs/diagrams/high-level.md`**:
   - Add Central Controller layer
   - Remove separate `vectorStore` (show pgvector integration)
   - Update all file paths
   - Show tool ecosystem

3. **Update `docs/diagrams/storage-lifecycle.md`**:
   - **Remove ephemeral vectorStore concept**
   - Document single persistent store with pgvector
   - Show Drizzle schema
   - Document `sourcePaperId` provenance

4. **Update `docs/diagrams/pipeline-internals.md`**:
   - Remove `orchestrator.js` references
   - Add pre-parse stage
   - Update to event-driven workflow model
   - Show embedding storage in main DB

---

### 🟡 **Minor Updates Needed**

5. **Update `docs/edc-workflow.md`**:
   - Add pre-parse step to diagram
   - Mention `00_preparsed.json` artifact
   - Update file extensions to `.ts`

6. **Update `docs/integration-workflow.md`**:
   - Clarify that embeddings are persistent (not ephemeral)
   - Document `sourcePaperId` field

7. **Create new doc**: `docs/openalex-integration.md`
   - API usage patterns
   - Rate limiting (polite pool)
   - arXiv fallback logic

8. **Create new doc**: `docs/configuration.md`
   - Environment variables
   - `src/config/index.ts` structure

---

### 🟢 **Keep As-Is** (Accurate)

- ✅ `docs/agentic-architecture.md`
- ✅ `docs/agentic-flows.md`
- ✅ Core workflow diagrams (EDC/Integration) - just add pre-parse

---

## Action Items Summary

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 🔴 P0 | Rewrite `docs/architecture.md` | High | High - Main entry point |
| 🔴 P0 | Fix `docs/diagrams/storage-lifecycle.md` | Medium | High - Conceptually wrong |
| 🔴 P0 | Update `docs/diagrams/high-level.md` | Medium | High - Outdated structure |
| 🟡 P1 | Update `docs/diagrams/pipeline-internals.md` | Medium | Medium |
| 🟡 P1 | Add pre-parse to `docs/edc-workflow.md` | Low | Medium |
| 🟡 P2 | Create `docs/openalex-integration.md` | Medium | Low - Already in agentic docs |
| 🟢 P3 | Create `docs/configuration.md` | Low | Low - Nice to have |

---

## Conclusion

**The documentation is ~60% accurate**, with critical gaps in:
1. **File structure** (all `.js` references are wrong)
2. **Storage architecture** (ephemeral vector store doesn't exist)
3. **Agentic layer** (missing from architecture docs)
4. **Technology stack** (Drizzle, Supabase, OpenAlex not documented)

**Recommendation**: Prioritize updating `architecture.md` and storage diagrams before turning in assignment, as these are fundamental to understanding the system.
