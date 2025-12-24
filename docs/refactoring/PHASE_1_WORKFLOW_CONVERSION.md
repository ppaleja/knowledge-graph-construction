# Phase 1: Convert to Basic LlamaIndex Workflow

## Overview

Convert the current custom `PipelineOrchestrator` to use LlamaIndex's native `Workflow` pattern. This phase establishes the event-driven architecture foundation without changing core processing logic.

## Goals

- ✅ Replace linear orchestrator with event-driven workflow
- ✅ Define custom events for each pipeline stage
- ✅ Convert each pipeline step into a workflow handler
- ✅ Maintain existing functionality and interfaces
- ✅ Enable future extensibility (parallelization, loops, state)

## Current Architecture

```
PipelineOrchestrator (Linear)
  ↓
1. Load (LlamaParseLoader)
  ↓
2. Extract (Extractor)
  ↓
3. Define (Definer)
  ↓
4. Canonicalize (Canonicalizer)
  ↓
5. Save (DrizzleGraphStore)
```

## Target Architecture

```
Workflow (Event-Driven)
  ↓
LoadEvent → ExtractEvent → DefineEvent → CanonicalizeEvent → SaveEvent → CompleteEvent
  |            |              |                |                 |           |
Handler      Handler        Handler          Handler          Handler    (Done)
```

## Implementation Steps

### Step 1: Install Required Dependencies

```bash
npm install @llamaindex/workflow-core
```

### Step 2: Define Workflow Events

**File**: `src/pipeline/workflow/events.ts`

```typescript
import { workflowEvent } from "@llamaindex/workflow-core";
import type { GraphData } #types/domain.js";

// Event fired to start the pipeline with a paper path
export const loadEvent = workflowEvent<{ paperPath: string }>();

// Event fired when paper text is loaded and ready for extraction
export const extractEvent = workflowEvent<{ 
  text: string;
  paperPath: string;
}>();

// Event fired when raw entities/relationships are extracted
export const defineEvent = workflowEvent<{ 
  graph: GraphData;
  paperPath: string;
}>();

// Event fired when types are refined and standardized
export const canonicalizeEvent = workflowEvent<{ 
  graph: GraphData;
  paperPath: string;
}>();

// Event fired when entities are deduplicated
export const saveEvent = workflowEvent<{ 
  graph: GraphData;
  paperPath: string;
}>();

// Event fired when graph is persisted to database
export const completeEvent = workflowEvent<{ 
  success: boolean;
  paperPath: string;
  entitiesCount: number;
  relationshipsCount: number;
}>();

// Event fired on any error
export const errorEvent = workflowEvent<{
  stage: string;
  error: string;
  paperPath: string;
}>();
```

### Step 3: Create Workflow Factory

**File**: `src/pipeline/workflow/edcWorkflow.ts`

```typescript
import { createWorkflow } from "@llamaindex/workflow-core";
import {
  loadEvent,
  extractEvent,
  defineEvent,
  canonicalizeEvent,
  saveEvent,
  completeEvent,
  errorEvent,
} from "./events.js";
import { LlamaParseLoader } #ingestion/loader.js";
import { Extractor } from "../extract/index.js";
import { Definer } from "../define/index.js";
import { Canonicalizer } from "../canonicalize/index.js";
import { DrizzleGraphStore } #storage/drizzleStore.js";
import * as fs from "fs/promises";
import * as path from "path";

export function createEDCWorkflow() {
  const workflow = createWorkflow();

  // ============================================
  // HANDLER 1: Load Paper
  // ============================================
  workflow.handle([loadEvent], async (context, event) => {
    const { sendEvent } = context;
    const { paperPath } = event.data;

    console.log("=== Starting EDC Pipeline ===");
    console.log(`[Load Handler] Loading paper: ${paperPath}`);

    try {
      const loader = new LlamaParseLoader();
      const text = await loader.load(paperPath);
      console.log(`[Load Handler] Loaded ${text.length} characters`);

      // Send to extraction
      sendEvent(extractEvent.with({ text, paperPath }));
    } catch (error) {
      console.error(`[Load Handler] Error:`, error);
      sendEvent(errorEvent.with({
        stage: "load",
        error: (error as Error).message,
        paperPath,
      }));
    }
  });

  // ============================================
  // HANDLER 2: Extract Entities & Relationships
  // ============================================
  workflow.handle([extractEvent], async (context, event) => {
    const { sendEvent } = context;
    const { text, paperPath } = event.data;

    console.log(`[Extract Handler] Processing text...`);

    try {
      const extractor = new Extractor();
      const rawGraph = await extractor.process(text);

      // Save debug output
      const debugDir = path.resolve("debug");
      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(
        path.join(debugDir, "01_extraction.json"),
        JSON.stringify(rawGraph, null, 2)
      );

      console.log(`[Extract Handler] Extracted ${rawGraph.entities.length} entities, ${rawGraph.relationships.length} relationships`);

      // Send to definition
      sendEvent(defineEvent.with({ graph: rawGraph, paperPath }));
    } catch (error) {
      console.error(`[Extract Handler] Error:`, error);
      sendEvent(errorEvent.with({
        stage: "extract",
        error: (error as Error).message,
        paperPath,
      }));
    }
  });

  // ============================================
  // HANDLER 3: Define & Refine Types
  // ============================================
  workflow.handle([defineEvent], async (context, event) => {
    const { sendEvent } = context;
    const { graph, paperPath } = event.data;

    console.log(`[Define Handler] Refining ${graph.entities.length} entities...`);

    try {
      const definer = new Definer();
      const refinedGraph = await definer.process(graph);

      // Save debug output
      const debugDir = path.resolve("debug");
      await fs.writeFile(
        path.join(debugDir, "02_definition.json"),
        JSON.stringify(refinedGraph, null, 2)
      );

      console.log(`[Define Handler] Types refined`);

      // Send to canonicalization
      sendEvent(canonicalizeEvent.with({ graph: refinedGraph, paperPath }));
    } catch (error) {
      console.error(`[Define Handler] Error:`, error);
      sendEvent(errorEvent.with({
        stage: "define",
        error: (error as Error).message,
        paperPath,
      }));
    }
  });

  // ============================================
  // HANDLER 4: Canonicalize & Deduplicate
  // ============================================
  workflow.handle([canonicalizeEvent], async (context, event) => {
    const { sendEvent } = context;
    const { graph, paperPath } = event.data;

    console.log(`[Canonicalize Handler] Resolving ${graph.entities.length} entities...`);

    try {
      const canonicalizer = new Canonicalizer();
      const finalGraph = await canonicalizer.process(graph);

      // Save debug output
      const debugDir = path.resolve("debug");
      await fs.writeFile(
        path.join(debugDir, "03_canonicalization.json"),
        JSON.stringify(finalGraph, null, 2)
      );

      console.log(`[Canonicalize Handler] Reduced to ${finalGraph.entities.length} unique entities`);

      // Send to storage
      sendEvent(saveEvent.with({ graph: finalGraph, paperPath }));
    } catch (error) {
      console.error(`[Canonicalize Handler] Error:`, error);
      sendEvent(errorEvent.with({
        stage: "canonicalize",
        error: (error as Error).message,
        paperPath,
      }));
    }
  });

  // ============================================
  // HANDLER 5: Save to Database
  // ============================================
  workflow.handle([saveEvent], async (context, event) => {
    const { sendEvent } = context;
    const { graph, paperPath } = event.data;

    console.log(`[Save Handler] Persisting ${graph.entities.length} entities to database...`);

    try {
      const store = new DrizzleGraphStore();
      await store.init();
      await store.saveGraph(graph);
      await store.close();

      console.log(`[Save Handler] Successfully saved to database`);

      // Pipeline complete
      sendEvent(completeEvent.with({
        success: true,
        paperPath,
        entitiesCount: graph.entities.length,
        relationshipsCount: graph.relationships.length,
      }));
    } catch (error) {
      console.error(`[Save Handler] Error:`, error);
      sendEvent(errorEvent.with({
        stage: "save",
        error: (error as Error).message,
        paperPath,
      }));
    }
  });

  // ============================================
  // HANDLER 6: Handle Errors
  // ============================================
  workflow.handle([errorEvent], async (context, event) => {
    const { stage, error, paperPath } = event.data;
    console.error(`[Error Handler] Pipeline failed at ${stage} stage for ${paperPath}`);
    console.error(`[Error Handler] Error: ${error}`);
    
    // Send completion with failure
    context.sendEvent(completeEvent.with({
      success: false,
      paperPath,
      entitiesCount: 0,
      relationshipsCount: 0,
    }));
  });

  return workflow;
}
```

### Step 4: Update Entry Point

**File**: `src/index.ts`

```typescript
import { initLLM } from "./utils/llm.js";
import * as path from "path";
import { createEDCWorkflow } from "./pipeline/workflow/edcWorkflow.js";
import { loadEvent, completeEvent } from "./pipeline/workflow/events.js";

async function main() {
  const paperPath = process.argv[2];
  if (!paperPath) {
    console.error("Please provide a path to a PDF paper.");
    process.exit(1);
  }

  // Init LlamaIndex Settings
  initLLM();

  // Create workflow instance
  const workflow = createEDCWorkflow();

  // Create context and start pipeline
  const { stream, sendEvent } = workflow.createContext();

  // Send initial event
  sendEvent(loadEvent.with({ paperPath: path.resolve(paperPath) }));

  // Wait for completion
  for await (const event of stream) {
    if (completeEvent.include(event)) {
      const { success, entitiesCount, relationshipsCount } = event.data;
      
      if (success) {
        console.log("=== Pipeline Complete ===");
        console.log(`✅ Extracted ${entitiesCount} entities`);
        console.log(`✅ Extracted ${relationshipsCount} relationships`);
      } else {
        console.log("=== Pipeline Failed ===");
        process.exit(1);
      }
      
      break;
    }
  }
}

main().catch(console.error);
```

### Step 5: (Optional) Keep Legacy Orchestrator for Comparison

**File**: `src/pipeline/orchestrator.legacy.ts`

Rename the existing orchestrator to `.legacy.ts` for reference during migration.

## Testing Strategy

### Unit Tests
```typescript
// Test individual handlers
describe("Extract Handler", () => {
  it("should extract entities from text", async () => {
    const workflow = createEDCWorkflow();
    const context = workflow.createContext();
    
    // Mock text input
    const mockText = "Sample paper text...";
    
    // Send extract event
    context.sendEvent(extractEvent.with({ 
      text: mockText, 
      paperPath: "/test/paper.pdf" 
    }));
    
    // Wait for define event
    const result = await context.stream.filter(defineEvent).take(1).toArray();
    expect(result[0].data.graph.entities.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests
```typescript
// Test full pipeline
describe("EDC Workflow", () => {
  it("should process paper end-to-end", async () => {
    const workflow = createEDCWorkflow();
    const { stream, sendEvent } = workflow.createContext();
    
    sendEvent(loadEvent.with({ paperPath: "./test/fixtures/sample.pdf" }));
    
    const result = await stream.filter(completeEvent).take(1).toArray();
    expect(result[0].data.success).toBe(true);
  });
});
```

## Migration Checklist

- [ ] Install `@llamaindex/workflow-core` package
- [ ] Create `src/pipeline/workflow/` directory
- [ ] Implement `events.ts` with all event definitions
- [ ] Implement `edcWorkflow.ts` with workflow factory
- [ ] Update `src/index.ts` to use new workflow
- [ ] Test with existing sample paper
- [ ] Verify debug outputs are still generated
- [ ] Verify database persistence works
- [ ] Compare performance with legacy orchestrator
- [ ] Update documentation
- [ ] Remove or archive legacy orchestrator

## Success Criteria

✅ **Functional Parity**: New workflow produces identical results to legacy orchestrator
✅ **Event Flow**: All events fire in correct sequence
✅ **Error Handling**: Errors are caught and routed to error handler
✅ **Debug Outputs**: Intermediate JSON files are created
✅ **Database Persistence**: Entities and relationships saved correctly
✅ **Code Quality**: Handlers are modular and testable

## Benefits Unlocked

1. **Composability**: Can now add handlers without modifying workflow structure
2. **Observability**: Can listen to any event for monitoring/logging
3. **Testability**: Each handler can be tested independently
4. **Foundation**: Ready for Phase 2 (state) and Phase 3 (loops)
5. **Streaming**: Can stream events to UI/API in future

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking changes | Keep legacy orchestrator as fallback |
| Performance regression | Benchmark both implementations |
| Learning curve | Comprehensive code comments and docs |
| Bug introduction | Extensive testing before deprecating old code |

## Estimated Effort

- **Implementation**: 4-6 hours
- **Testing**: 2-3 hours
- **Documentation**: 1-2 hours
- **Total**: 1 day

## Next Steps

After completing Phase 1, proceed to:
- **Phase 2**: Add state management middleware
- **Phase 3**: Implement quality checking loops