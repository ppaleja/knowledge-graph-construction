# Implementation Plan: Workflow Logic

This phase implements the core logic of the EDC pipeline using LlamaIndex's `createWorkflow` and connects the existing domain classes to the event-driven architecture.

## Steps

### 1. Create Workflow Definition
Create `src/pipeline/workflow/index.ts` to house the workflow construction and handler registration.

**Imports Needed:**
- `createWorkflow` from `@llamaindex/workflow-core`
- Events from `./events.ts`
- State middleware from `./factory.ts`
- Existing domain classes (`LlamaParseLoader`, `Extractor`, `Definer`, `Canonicalizer`, `DrizzleGraphStore`)

### 2. Implement Step Handlers
Each handler will wrap an existing class method, update the workflow state, and emit the next event.

#### A. Load Handler
- **Trigger**: `LoadEvent`
- **Action**:
  - Instantiate `LlamaParseLoader`.
  - Call `loader.load(event.data.paperPath)`.
  - Update state: `paperPath`, `originalText`.
- **Next Event**: `ExtractEvent`

#### B. Extract Handler
- **Trigger**: `ExtractEvent`
- **Action**:
  - Instantiate `Extractor`.
  - Call `extractor.process(event.data.text)`.
  - Update state: `artifacts.rawExtraction`.
- **Next Event**: `DefineEvent`

#### C. Define Handler
- **Trigger**: `DefineEvent`
- **Action**:
  - Instantiate `Definer`.
  - Call `definer.process(event.data.graph)`.
  - Update state: `artifacts.refinedDefinition`.
- **Next Event**: `CanonicalizeEvent`

#### D. Canonicalize Handler
- **Trigger**: `CanonicalizeEvent`
- **Action**:
  - Instantiate `Canonicalizer`.
  - Call `canonicalizer.process(event.data.graph)`.
  - Update state: `artifacts.canonicalizedGraph`.
- **Next Event**: `SaveEvent`

#### E. Save Handler
- **Trigger**: `SaveEvent`
- **Action**:
  - Instantiate `DrizzleGraphStore`.
  - Call `store.init()` and `store.saveGraph(event.data.graph)`.
  - Call `store.close()`.
  - Update state: `metrics.endTime`.
- **Next Event**: `CompleteEvent`

### 3. Assemble the Workflow
Combine the handlers and the state middleware into the exported workflow instance.

**Draft Code Structure:**
```typescript
import { createWorkflow } from "@llamaindex/workflow-core";
import { withState } from "./factory.js";
import * as Events from "./events.js";
// ... imports for domain classes

const workflow = createWorkflow();

workflow.handle([Events.LoadEvent], async (context, event) => {
    const { state, sendEvent } = context;
    state.paperPath = event.data.paperPath;
    
    const loader = new LlamaParseLoader();
    const text = await loader.load(event.data.paperPath);
    state.originalText = text;
    
    sendEvent(Events.ExtractEvent.with({ text }));
});

// ... implement other handlers similarly ...

export const edcWorkflow = withState(workflow);
```

### 4. Refactor Entry Point
Update `src/index.ts` to use the new workflow instead of `PipelineOrchestrator`.

**Changes:**
- Import `edcWorkflow` and `LoadEvent`.
- Create a context using `edcWorkflow.createContext()`.
- Send the initial `LoadEvent`.
- Listen for `CompleteEvent` (or stream events for progress logging).

**Draft Code:**
```typescript
// src/index.ts
import { edcWorkflow } from "./pipeline/workflow/index.js";
import { LoadEvent, CompleteEvent } from "./pipeline/workflow/events.js";

// ... inside main() ...
const { stream, sendEvent } = edcWorkflow.createContext();

sendEvent(LoadEvent.with({ paperPath: path.resolve(paperPath) }));

for await (const event of stream) {
    if (CompleteEvent.include(event)) {
        console.log("Pipeline Complete!", event.data.stats);
        break;
    }
    // Add logging for other events here
}
```

## Verification
- [ ] Run the pipeline with a sample PDF.
- [ ] Verify that data flows correctly from one step to the next.
- [ ] Check `debug/` folder (if we keep the file writing logic) or inspect the final database state.
- [ ] Ensure the process terminates correctly.