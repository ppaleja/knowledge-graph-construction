# Phase 2: Add State Management with Middleware

## Overview

Enhance the event-driven workflow from Phase 1 with LlamaIndex's stateful middleware. This enables centralized state management, progress tracking, and prepares the system for advanced features like resumability and parallel processing.

## Goals

- ✅ Add workflow state tracking across all pipeline stages
- ✅ Store intermediate outputs for debugging and recovery
- ✅ Track metrics (timing, entity counts, attempts)
- ✅ Enable state-based decision making (for Phase 3 loops)
- ✅ Prepare for workflow resumability and persistence

## Current State (Post Phase 1)

```
Event-Driven Workflow
  ↓
LoadEvent → ExtractEvent → DefineEvent → CanonicalizeEvent → SaveEvent → CompleteEvent
  |            |              |                |                 |           |
Handler      Handler        Handler          Handler          Handler    (Done)
  
❌ No shared state between handlers
❌ Can't track progress across stages
❌ No way to resume if interrupted
❌ Metrics scattered across console logs
```

## Target Architecture

```
Stateful Workflow (with Middleware)
  ↓
State: {
  paperPath, startTime, metrics,
  intermediateOutputs, attempts
}
  ↓
LoadEvent → ExtractEvent → DefineEvent → CanonicalizeEvent → SaveEvent → CompleteEvent
  |            |              |                |                 |           |
Handler      Handler        Handler          Handler          Handler    (Done)
(reads &    (reads &       (reads &         (reads &         (reads &
 updates     updates        updates          updates          updates
 state)      state)         state)           state)           state)
```

## Implementation Steps

### Step 1: Define State Type

**File**: `src/pipeline/workflow/state.ts`

```typescript
import type { GraphData } from "../../types/domain.js";

/**
 * EDC Workflow State
 * Persists across all handlers and maintains pipeline context
 */
export type EDCState = {
  // Input metadata
  paperPath: string;
  paperName: string;
  
  // Timing metrics
  startTime: number;
  loadTime?: number;
  extractTime?: number;
  defineTime?: number;
  canonicalizeTime?: number;
  saveTime?: number;
  totalTime?: number;
  
  // Intermediate outputs (for debugging and recovery)
  intermediateOutputs: {
    rawText?: string;
    extraction?: GraphData;
    definition?: GraphData;
    canonicalization?: GraphData;
  };
  
  // Processing metrics
  metrics: {
    textLength: number;
    rawEntityCount: number;
    refinedEntityCount: number;
    finalEntityCount: number;
    rawRelationshipCount: number;
    finalRelationshipCount: number;
    deduplicationRatio: number;
  };
  
  // Retry tracking (for Phase 3)
  attempts: {
    extraction: number;
    definition: number;
    canonicalization: number;
  };
  
  // Quality tracking (for Phase 3)
  qualityScores: {
    extractionQuality?: number;
    definitionQuality?: number;
    overallQuality?: number;
  };
  
  // Error tracking
  errors: Array<{
    stage: string;
    message: string;
    timestamp: number;
  }>;
  
  // Status flags
  isComplete: boolean;
  isSuccess: boolean;
};

/**
 * Factory function to create initial state
 */
export function createInitialState(paperPath: string): EDCState {
  return {
    paperPath,
    paperName: paperPath.split("/").pop() || "unknown",
    startTime: Date.now(),
    intermediateOutputs: {},
    metrics: {
      textLength: 0,
      rawEntityCount: 0,
      refinedEntityCount: 0,
      finalEntityCount: 0,
      rawRelationshipCount: 0,
      finalRelationshipCount: 0,
      deduplicationRatio: 0,
    },
    attempts: {
      extraction: 0,
      definition: 0,
      canonicalization: 0,
    },
    qualityScores: {},
    errors: [],
    isComplete: false,
    isSuccess: false,
  };
}
```

### Step 2: Create Stateful Workflow

**File**: `src/pipeline/workflow/edcWorkflow.ts` (Updated)

```typescript
import { createWorkflow } from "@llamaindex/workflow-core";
import { createStatefulMiddleware } from "@llamaindex/workflow-core/middleware/state";
import {
  loadEvent,
  extractEvent,
  defineEvent,
  canonicalizeEvent,
  saveEvent,
  completeEvent,
  errorEvent,
} from "./events.js";
import { EDCState, createInitialState } from "./state.js";
import { LlamaParseLoader } from "../../ingestion/loader.js";
import { Extractor } from "../extract/index.js";
import { Definer } from "../define/index.js";
import { Canonicalizer } from "../canonicalize/index.js";
import { DrizzleGraphStore } from "../../storage/drizzleStore.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Create stateful middleware for EDC workflow
 */
const { withState, getContext } = createStatefulMiddleware(
  (state: EDCState) => state
);

export function createEDCWorkflow() {
  const baseWorkflow = createWorkflow();
  
  // Wrap with state middleware
  const workflow = withState(baseWorkflow);

  // ============================================
  // HANDLER 1: Load Paper
  // ============================================
  workflow.handle([loadEvent], async (context, event) => {
    const { sendEvent, state } = context;
    const { paperPath } = event.data;

    console.log("=== Starting EDC Pipeline ===");
    console.log(`[Load Handler] Loading paper: ${paperPath}`);

    const loadStartTime = Date.now();

    try {
      const loader = new LlamaParseLoader();
      const text = await loader.load(paperPath);
      
      // Update state
      state.loadTime = Date.now() - loadStartTime;
      state.intermediateOutputs.rawText = text;
      state.metrics.textLength = text.length;
      
      console.log(`[Load Handler] Loaded ${text.length} characters in ${state.loadTime}ms`);

      // Send to extraction
      sendEvent(extractEvent.with({ text, paperPath }));
    } catch (error) {
      // Log error to state
      state.errors.push({
        stage: "load",
        message: (error as Error).message,
        timestamp: Date.now(),
      });
      
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
    const { sendEvent, state } = context;
    const { text, paperPath } = event.data;

    console.log(`[Extract Handler] Processing text...`);
    
    const extractStartTime = Date.now();
    state.attempts.extraction += 1;

    try {
      const extractor = new Extractor();
      const rawGraph = await extractor.process(text);

      // Update state
      state.extractTime = Date.now() - extractStartTime;
      state.intermediateOutputs.extraction = rawGraph;
      state.metrics.rawEntityCount = rawGraph.entities.length;
      state.metrics.rawRelationshipCount = rawGraph.relationships.length;

      // Save debug output
      const debugDir = path.resolve("debug");
      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(
        path.join(debugDir, "01_extraction.json"),
        JSON.stringify({
          graph: rawGraph,
          metadata: {
            extractTime: state.extractTime,
            attempt: state.attempts.extraction,
            textLength: state.metrics.textLength,
          }
        }, null, 2)
      );

      console.log(`[Extract Handler] Extracted ${rawGraph.entities.length} entities, ${rawGraph.relationships.length} relationships in ${state.extractTime}ms`);

      // Send to definition
      sendEvent(defineEvent.with({ graph: rawGraph, paperPath }));
    } catch (error) {
      state.errors.push({
        stage: "extract",
        message: (error as Error).message,
        timestamp: Date.now(),
      });
      
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
    const { sendEvent, state } = context;
    const { graph, paperPath } = event.data;

    console.log(`[Define Handler] Refining ${graph.entities.length} entities...`);
    
    const defineStartTime = Date.now();
    state.attempts.definition += 1;

    try {
      const definer = new Definer();
      const refinedGraph = await definer.process(graph);

      // Update state
      state.defineTime = Date.now() - defineStartTime;
      state.intermediateOutputs.definition = refinedGraph;
      state.metrics.refinedEntityCount = refinedGraph.entities.length;

      // Save debug output
      const debugDir = path.resolve("debug");
      await fs.writeFile(
        path.join(debugDir, "02_definition.json"),
        JSON.stringify({
          graph: refinedGraph,
          metadata: {
            defineTime: state.defineTime,
            attempt: state.attempts.definition,
            beforeCount: state.metrics.rawEntityCount,
            afterCount: state.metrics.refinedEntityCount,
          }
        }, null, 2)
      );

      console.log(`[Define Handler] Types refined in ${state.defineTime}ms`);

      // Send to canonicalization
      sendEvent(canonicalizeEvent.with({ graph: refinedGraph, paperPath }));
    } catch (error) {
      state.errors.push({
        stage: "define",
        message: (error as Error).message,
        timestamp: Date.now(),
      });
      
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
    const { sendEvent, state } = context;
    const { graph, paperPath } = event.data;

    console.log(`[Canonicalize Handler] Resolving ${graph.entities.length} entities...`);
    
    const canonicalizeStartTime = Date.now();
    state.attempts.canonicalization += 1;

    try {
      const canonicalizer = new Canonicalizer();
      const finalGraph = await canonicalizer.process(graph);

      // Update state
      state.canonicalizeTime = Date.now() - canonicalizeStartTime;
      state.intermediateOutputs.canonicalization = finalGraph;
      state.metrics.finalEntityCount = finalGraph.entities.length;
      state.metrics.finalRelationshipCount = finalGraph.relationships.length;
      
      // Calculate deduplication ratio
      const beforeCount = state.metrics.refinedEntityCount;
      const afterCount = state.metrics.finalEntityCount;
      state.metrics.deduplicationRatio = beforeCount > 0 
        ? (beforeCount - afterCount) / beforeCount 
        : 0;

      // Save debug output
      const debugDir = path.resolve("debug");
      await fs.writeFile(
        path.join(debugDir, "03_canonicalization.json"),
        JSON.stringify({
          graph: finalGraph,
          metadata: {
            canonicalizeTime: state.canonicalizeTime,
            attempt: state.attempts.canonicalization,
            beforeCount,
            afterCount,
            deduplicationRatio: state.metrics.deduplicationRatio,
          }
        }, null, 2)
      );

      console.log(`[Canonicalize Handler] Reduced to ${finalGraph.entities.length} unique entities (${(state.metrics.deduplicationRatio * 100).toFixed(1)}% deduplicated) in ${state.canonicalizeTime}ms`);

      // Send to storage
      sendEvent(saveEvent.with({ graph: finalGraph, paperPath }));
    } catch (error) {
      state.errors.push({
        stage: "canonicalize",
        message: (error as Error).message,
        timestamp: Date.now(),
      });
      
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
    const { sendEvent, state } = context;
    const { graph, paperPath } = event.data;

    console.log(`[Save Handler] Persisting ${graph.entities.length} entities to database...`);
    
    const saveStartTime = Date.now();

    try {
      const store = new DrizzleGraphStore();
      await store.init();
      await store.saveGraph(graph);
      await store.close();

      // Update state
      state.saveTime = Date.now() - saveStartTime;
      state.totalTime = Date.now() - state.startTime;
      state.isComplete = true;
      state.isSuccess = true;

      console.log(`[Save Handler] Successfully saved to database in ${state.saveTime}ms`);
      
      // Save final state summary
      const debugDir = path.resolve("debug");
      await fs.writeFile(
        path.join(debugDir, "04_state_summary.json"),
        JSON.stringify({
          paperPath: state.paperPath,
          paperName: state.paperName,
          timing: {
            loadTime: state.loadTime,
            extractTime: state.extractTime,
            defineTime: state.defineTime,
            canonicalizeTime: state.canonicalizeTime,
            saveTime: state.saveTime,
            totalTime: state.totalTime,
          },
          metrics: state.metrics,
          attempts: state.attempts,
          qualityScores: state.qualityScores,
          errors: state.errors,
          isSuccess: state.isSuccess,
        }, null, 2)
      );

      // Pipeline complete
      sendEvent(completeEvent.with({
        success: true,
        paperPath,
        entitiesCount: graph.entities.length,
        relationshipsCount: graph.relationships.length,
      }));
    } catch (error) {
      state.errors.push({
        stage: "save",
        message: (error as Error).message,
        timestamp: Date.now(),
      });
      
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
    const { state } = context;
    const { stage, error, paperPath } = event.data;
    
    console.error(`[Error Handler] Pipeline failed at ${stage} stage for ${paperPath}`);
    console.error(`[Error Handler] Error: ${error}`);
    
    // Update final state
    state.isComplete = true;
    state.isSuccess = false;
    state.totalTime = Date.now() - state.startTime;
    
    // Save error state
    const debugDir = path.resolve("debug");
    await fs.writeFile(
      path.join(debugDir, "04_state_summary.json"),
      JSON.stringify({
        paperPath: state.paperPath,
        paperName: state.paperName,
        timing: {
          loadTime: state.loadTime,
          extractTime: state.extractTime,
          defineTime: state.defineTime,
          canonicalizeTime: state.canonicalizeTime,
          saveTime: state.saveTime,
          totalTime: state.totalTime,
        },
        metrics: state.metrics,
        attempts: state.attempts,
        errors: state.errors,
        isSuccess: state.isSuccess,
        failedAt: stage,
      }, null, 2)
    );
    
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

### Step 3: Update Entry Point with State Initialization

**File**: `src/index.ts` (Updated)

```typescript
import { initLLM } from "./utils/llm.js";
import * as path from "path";
import { createEDCWorkflow } from "./pipeline/workflow/edcWorkflow.js";
import { loadEvent, completeEvent } from "./pipeline/workflow/events.js";
import { createInitialState } from "./pipeline/workflow/state.js";

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

  // Create context with initial state
  const resolvedPath = path.resolve(paperPath);
  const { stream, sendEvent } = workflow.createContext(
    createInitialState(resolvedPath)
  );

  // Send initial event
  sendEvent(loadEvent.with({ paperPath: resolvedPath }));

  // Wait for completion
  for await (const event of stream) {
    if (completeEvent.include(event)) {
      const { success, entitiesCount, relationshipsCount } = event.data;
      
      if (success) {
        console.log("\n=== Pipeline Complete ===");
        console.log(`✅ Extracted ${entitiesCount} entities`);
        console.log(`✅ Extracted ${relationshipsCount} relationships`);
        console.log(`📊 See debug/04_state_summary.json for detailed metrics`);
      } else {
        console.log("\n=== Pipeline Failed ===");
        console.log(`❌ See debug/04_state_summary.json for error details`);
        process.exit(1);
      }
      
      break;
    }
  }
}

main().catch(console.error);
```

### Step 4: Add State Inspection Utility

**File**: `src/pipeline/workflow/stateInspector.ts`

```typescript
import type { EDCState } from "./state.js";

/**
 * Utility functions for inspecting and analyzing workflow state
 */
export class StateInspector {
  /**
   * Generate a human-readable summary of the state
   */
  static summarize(state: EDCState): string {
    const lines = [
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📄 Paper: ${state.paperName}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `⏱️  Timing:`,
      `   Load:          ${state.loadTime || 0}ms`,
      `   Extract:       ${state.extractTime || 0}ms`,
      `   Define:        ${state.defineTime || 0}ms`,
      `   Canonicalize:  ${state.canonicalizeTime || 0}ms`,
      `   Save:          ${state.saveTime || 0}ms`,
      `   ─────────────────────`,
      `   Total:         ${state.totalTime || 0}ms`,
      ``,
      `📊 Metrics:`,
      `   Text Length:        ${state.metrics.textLength.toLocaleString()} chars`,
      `   Raw Entities:       ${state.metrics.rawEntityCount}`,
      `   Refined Entities:   ${state.metrics.refinedEntityCount}`,
      `   Final Entities:     ${state.metrics.finalEntityCount}`,
      `   Deduplication:      ${(state.metrics.deduplicationRatio * 100).toFixed(1)}%`,
      `   Relationships:      ${state.metrics.finalRelationshipCount}`,
      ``,
      `🔄 Attempts:`,
      `   Extraction:     ${state.attempts.extraction}`,
      `   Definition:     ${state.attempts.definition}`,
      `   Canonicalize:   ${state.attempts.canonicalization}`,
      ``,
      `${state.isSuccess ? '✅' : '❌'} Status: ${state.isSuccess ? 'Success' : 'Failed'}`,
    ];

    if (state.errors.length > 0) {
      lines.push(``, `❌ Errors (${state.errors.length}):`);
      state.errors.forEach((err, i) => {
        lines.push(`   ${i + 1}. [${err.stage}] ${err.message}`);
      });
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    return lines.join('\n');
  }

  /**
   * Check if state indicates pipeline should retry
   */
  static shouldRetry(state: EDCState, maxAttempts: number = 3): boolean {
    return (
      !state.isSuccess &&
      state.attempts.extraction < maxAttempts &&
      state.errors.length > 0
    );
  }

  /**
   * Calculate overall quality score
   */
  static calculateQuality(state: EDCState): number {
    const scores: number[] = [];
    
    // Entity count quality (more is generally better, up to a point)
    if (state.metrics.finalEntityCount > 0) {
      scores.push(Math.min(state.metrics.finalEntityCount / 50, 1.0));
    }
    
    // Relationship ratio quality
    if (state.metrics.finalEntityCount > 0) {
      const relationshipRatio = state.metrics.finalRelationshipCount / state.metrics.finalEntityCount;
      scores.push(Math.min(relationshipRatio / 2, 1.0));
    }
    
    // Deduplication quality (moderate dedup is good)
    const idealDedup = 0.3; // 30% is reasonable
    if (state.metrics.deduplicationRatio > 0) {
      const dedupScore = 1 - Math.abs(state.metrics.deduplicationRatio - idealDedup) / idealDedup;
      scores.push(Math.max(dedupScore, 0));
    }
    
    return scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : 0;
  }
}
```

## Testing Strategy

### Test State Persistence

```typescript
describe("EDC State Management", () => {
  it("should maintain state across handlers", async () => {
    const workflow = createEDCWorkflow();
    const initialState = createInitialState("/test/paper.pdf");
    const { stream, sendEvent } = workflow.createContext(initialState);
    
    sendEvent(loadEvent.with({ paperPath: "/test/paper.pdf" }));
    
    // Collect all events
    const events = [];
    for await (const event of stream) {
      events.push(event);
      if (completeEvent.include(event)) break;
    }
    
    // Get final state (access via getContext utility)
    const finalState = getContext();
    
    expect(finalState.isComplete).toBe(true);
    expect(finalState.metrics.textLength).toBeGreaterThan(0);
    expect(finalState.attempts.extraction).toBeGreaterThan(0);
  });
});
```

## Migration Checklist

- [ ] Create `src/pipeline/workflow/state.ts` with state type and factory
- [ ] Update `edcWorkflow.ts` to use stateful middleware
- [ ] Add state read/write operations to all handlers
- [ ] Update entry point to initialize state
- [ ] Implement state inspector utility
- [ ] Add state summary to debug outputs
- [ ] Test state persistence across handlers
- [ ] Verify metrics are calculated correctly
- [ ] Update documentation

## Success Criteria

✅ **State Persistence**: State maintained across all handlers
✅ **Metrics Tracking**: All timing and count metrics captured
✅ **Debug Enhancement**: State summary saved to JSON
✅ **Error Tracking**: All errors logged to state
✅ **Attempt Counting**: Retry attempts tracked per stage
✅ **Quality Foundation**: State structure supports Phase 3 quality checks

## Benefits Unlocked

1. **Observability**: Complete visibility into pipeline execution
2. **Debugging**: Intermediate state available at any point
3. **Metrics**: Performance and quality tracking built-in
4. **Resumability**: Foundation for checkpoint/resume (future)
5. **Decision Making**: State enables conditional logic in Phase 3

## Estimated Effort

- **Implementation**: 3-4 hours
- **Testing**: 2 hours
- **Documentation**: 1 hour
- **Total**: 6-7 hours (0.75 days)

## Next Steps

After completing Phase 2, proceed to:
- **Phase 3**: Implement quality checking and retry loops