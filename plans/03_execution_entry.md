# Implementation Plan: Execution Entry Point

This phase focuses on updating the application entry point to execute the new event-driven workflow, providing real-time feedback via event streaming, and cleaning up legacy code.

## Steps

### 1. Update Main Entry Point
Refactor `src/index.ts` to initialize and run the `edcWorkflow`.

**Key Responsibilities:**
- Initialize LLM settings (keep existing `initLLM`).
- Create a workflow context.
- Dispatch the initial `LoadEvent`.
- Iterate through the event stream to provide console feedback.
- Handle successful completion and errors.

**Draft Code:**
```typescript
import { initLLM } from "./utils/llm.js";
import * as path from "path";
import { edcWorkflow } from "./pipeline/workflow/index.js";
import { 
    LoadEvent, 
    ExtractEvent, 
    DefineEvent, 
    CanonicalizeEvent, 
    SaveEvent, 
    CompleteEvent, 
    ErrorEvent 
} from "./pipeline/workflow/events.js";

async function main() {
    const paperPath = process.argv[2];
    if (!paperPath) {
        console.error("Please provide a path to a PDF paper.");
        process.exit(1);
    }

    // Init LlamaIndex Settings
    initLLM();

    console.log("=== Starting EDC Workflow ===");
    
    // Create workflow context
    const { stream, sendEvent } = edcWorkflow.createContext();

    // Start the workflow
    sendEvent(LoadEvent.with({ paperPath: path.resolve(paperPath) }));

    // Stream events for real-time feedback
    for await (const event of stream) {
        if (LoadEvent.include(event)) {
            console.log(`[1/5] Loading paper: ${event.data.paperPath}...`);
        }
        else if (ExtractEvent.include(event)) {
            console.log(`[2/5] Extracting entities (Attempt ${event.data.retryCount || 1})...`);
        }
        else if (DefineEvent.include(event)) {
            console.log(`[3/5] Refining ontology for ${event.data.graph.entities.length} entities...`);
        }
        else if (CanonicalizeEvent.include(event)) {
            console.log(`[4/5] Canonicalizing graph...`);
        }
        else if (SaveEvent.include(event)) {
            console.log(`[5/5] Saving to database...`);
        }
        else if (CompleteEvent.include(event)) {
            console.log("=== Workflow Complete ===");
            console.log(`Success: ${event.data.success}`);
            if (event.data.stats) {
                console.log("Stats:", JSON.stringify(event.data.stats, null, 2));
            }
            break; // Exit loop
        }
        else if (ErrorEvent.include(event)) {
            console.error(`!!! Workflow Failed at stage '${event.data.stage}' !!!`);
            console.error(event.data.error);
            process.exit(1);
        }
    }
}

main().catch(console.error);
```

### 2. Deprecate Legacy Orchestrator
Once the workflow is verified, the old `PipelineOrchestrator` is no longer needed.

**Actions:**
- Delete `src/pipeline/orchestrator.ts`.
- Remove any unused imports in other files.

### 3. Verification
- [ ] Run `npm start <path_to_paper>` and observe the console output.
- [ ] Confirm that the output logs match the sequence of events.
- [ ] Verify that the process exits cleanly upon completion.
- [ ] Verify that errors (e.g., invalid path) are caught and logged gracefully.