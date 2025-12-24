import { initLLM } from "./utils/llm.js";
import * as path from "path";
import { createEDCWorkflow } from "./pipeline/workflow/edcWorkflow.js";
import { loadEvent, completeEvent } from "./pipeline/workflow/events.js";
import { createIntegrationWorkflow } from "./pipeline/workflow/integrationWorkflow.js";
import {
  integrateEvent,
  integrationCompleteEvent,
} from "./pipeline/workflow/integrationEvents.js";
import type { GraphData } from "./types/domain.js";

async function main() {
  const args = process.argv.slice(2);
  const paperPath = args.find((arg) => !arg.startsWith("--"));
  const shouldIntegrate = args.includes("--integrate");

  if (!paperPath) {
    console.error("Usage: node dist/index.js <path-to-paper.pdf> [--integrate]");
    console.error("  --integrate: Run integration workflow after extraction");
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

  // Wait for EDC completion
  let extractedGraph: GraphData | null = null;

  for await (const event of stream) {
    if (completeEvent.include(event)) {
      const { success, entitiesCount, relationshipsCount } = event.data;

      if (success) {
        console.log("=== EDC Pipeline Complete ===");
        console.log(`✅ Extracted ${entitiesCount} entities`);
        console.log(`✅ Extracted ${relationshipsCount} relationships`);

        // If integration is requested, trigger it
        if (shouldIntegrate) {
          console.log("\n=== Starting Integration Workflow ===");

          // Load the extracted graph from debug output
          const debugDir = path.resolve("debug");
          const finalGraphPath = path.join(
            debugDir,
            "03_canonicalization.json",
          );

          try {
            const fs = await import("fs/promises");
            const graphData = await fs.readFile(finalGraphPath, "utf-8");
            extractedGraph = JSON.parse(graphData);

            if (!extractedGraph) {
              throw new Error("Failed to load extracted graph");
            }

            // Create integration workflow
            const integrationWorkflow = createIntegrationWorkflow();
            const {
              stream: integrationStream,
              sendEvent: sendIntegrationEvent,
            } = integrationWorkflow.createContext();

            // Send integration event
            sendIntegrationEvent(
              integrateEvent.with({
                newGraph: extractedGraph,
                paperPath: path.resolve(paperPath),
              }),
            );

            // Wait for integration completion
            for await (const integrationEvent of integrationStream) {
              if (integrationCompleteEvent.include(integrationEvent)) {
                const {
                  success: integrationSuccess,
                  entitiesMerged,
                  entitiesCreated,
                } = integrationEvent.data;

                if (integrationSuccess) {
                  console.log("\n=== Integration Complete ===");
                  console.log(`✅ Merged ${entitiesMerged} entities`);
                  console.log(`✅ Created ${entitiesCreated} new entities`);
                } else {
                  console.log("\n=== Integration Failed ===");
                  process.exit(1);
                }

                break;
              }
            }
          } catch (error) {
            console.error("Failed to run integration workflow:", error);
            process.exit(1);
          }
        }
      } else {
        console.log("=== Pipeline Failed ===");
        process.exit(1);
      }

      break;
    }
  }
}

main().catch(console.error);
