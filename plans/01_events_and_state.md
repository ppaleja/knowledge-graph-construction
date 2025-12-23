npm install @llamaindex/workflow-core
```

### 2. Define Domain Events
Create a new file `src/pipeline/workflow/events.ts` to define strongly-typed events for each stage of the pipeline.

**Events to Implement:**
- `LoadEvent`: Triggered to start loading a paper.
  - Payload: `{ paperPath: string }`
- `ExtractEvent`: Triggered when text is ready for extraction.
  - Payload: `{ text: string, retryCount?: number }`
- `DefineEvent`: Triggered when raw graph is ready for refinement.
  - Payload: `{ graph: GraphData }`
- `CanonicalizeEvent`: Triggered when graph is refined.
  - Payload: `{ graph: GraphData }`
- `SaveEvent`: Triggered when graph is ready for persistence.
  - Payload: `{ graph: GraphData }`
- `CompleteEvent`: Triggered when pipeline finishes successfully.
  - Payload: `{ success: boolean, stats: any }`
- `ErrorEvent`: Triggered on failure.
  - Payload: `{ error: Error, stage: string }`

**Draft Code:**
```typescript
import { workflowEvent } from "@llamaindex/workflow-core";
import type { GraphData } from "../../types/domain.js";

export const LoadEvent = workflowEvent<{ paperPath: string }>();
export const ExtractEvent = workflowEvent<{ text: string; retryCount?: number }>();
export const DefineEvent = workflowEvent<{ graph: GraphData }>();
export const CanonicalizeEvent = workflowEvent<{ graph: GraphData }>();
export const SaveEvent = workflowEvent<{ graph: GraphData }>();
export const CompleteEvent = workflowEvent<{ success: boolean; stats: any }>();
export const ErrorEvent = workflowEvent<{ error: Error; stage: string }>();
```

### 3. Define Workflow State
Create a new file `src/pipeline/workflow/state.ts` to define the shape of the workflow's persistent state.

**State Interface:**
```typescript
import type { GraphData } from "../../types/domain.js";

export interface EDCState {
  // Input context
  paperPath: string;
  originalText: string;

  // Intermediate artifacts for debugging/inspection
  artifacts: {
    rawExtraction?: GraphData;
    refinedDefinition?: GraphData;
    canonicalizedGraph?: GraphData;
  };

  // Operational metrics
  metrics: {
    startTime: number;
    endTime?: number;
    extractionDuration?: number;
  };

  // Retry tracking for robustness
  retries: {
    extraction: number;
    definition: number;
  };
}
```

### 4. Configure Middleware
In `src/pipeline/workflow/factory.ts`, set up the stateful middleware factory.

**Draft Code:**
```typescript
import { createStatefulMiddleware } from "@llamaindex/workflow-core/middleware/state";
import type { EDCState } from "./state.js";

export const { withState, getContext } = createStatefulMiddleware<EDCState>(() => ({
  paperPath: "",
  originalText: "",
  artifacts: {},
  metrics: { startTime: Date.now() },
  retries: { extraction: 0, definition: 0 }
}));
```

## Verification
- [ ] Create a simple test script that initializes the workflow with state.
- [ ] Verify that events can be instantiated with correct payloads.
- [ ] Verify that state initializes with default values.