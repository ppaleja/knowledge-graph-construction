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
