# Architecture Documentation Update (Phase 2)

## Types & Interfaces Structure

After Phase 2 refactoring, the `src/types/` directory follows **Domain-Driven Design** principles with clear separation:

```
src/types/
├── domain.ts                   # Core domain types (Entity, Relationship, GraphData)
├── preparsedContext.ts        # Context type for preparsing
└── interfaces/
    ├── pipeline.ts            # Pipeline stage interfaces (IExtractor, IDefiner, ICanonicalizer)
    └── storage.ts             # Storage interface (IGraphStore)
```

### Design Rationale

**Dependency Inversion Principle**: High-level modules (orchestrator, workflows) depend on abstractions (interfaces) rather than concrete implementations. This enables:
- **Testability**: Mock implementations for unit testing
- **Swappability**: Replace storage backend or pipeline stages without changing consumers  
- **Clear contracts**: Explicit interface definitions document expected behavior

### Domain Types (`domain.ts`)

Core building blocks of the knowledge graph:
- `Entity`: Nodes in the graph (methods, metrics, tasks, datasets)
- `Relationship`: Edges connecting entities with typed relationships
- `GraphData`: Complete graph structure with entities and relationships

### Pipeline Interfaces (`interfaces/pipeline.ts`)

Defines the contract for each stage in the EDC (Extract-Define-Canonicalize) pipeline:
- `IPipelineStep<TInput, TOutput>`: Generic stage interface
- `IExtractor`: Extracts entities/relationships from text
- `IDefiner`: Consolidates schema across extracted data
- `ICanonicalizer`: Resolves duplicate entities

### Storage Interface (`interfaces/storage.ts`)

Defines persistence layer contract:
- `IGraphStore`: Graph database operations (save, query, close)
- Implemented by `DrizzleGraphStore` (Postgres + pgvector)

---

## Migration Notes

If you have existing code importing from `#types/domain.js`:

### Before (Phase 1)
```typescript
import type { IExtractor, IGraphStore, Entity } from "#types/domain.js";
```

### After (Phase 2)
```typescript
import type { Entity } from "#types/domain.js";
import type { IExtractor } from "#types/interfaces/pipeline.js";
import type { IGraphStore } from "#types/interfaces/storage.js";
```

All imports have been updated across the codebase. No action required for existing code.
