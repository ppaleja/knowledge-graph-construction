import { initLLM } from "./utils/llm.js";
import { centralController } from "./orchestrator/index.js";

async function main() {
  const args = process.argv.slice(2);

  // Check if using agentic mode
  const useAgent = args.includes("--agent");

  if (useAgent) {
    // NEW: Agentic mode using central controller
    const taskDescription = args.find((arg) => !arg.startsWith("--")) ||
      'Build a knowledge graph on Gaussian Splatting with 5 papers';

    console.log("=== Agentic Knowledge Graph Builder ===");
    console.log(`Task: ${taskDescription}\n`);

    // Init LlamaIndex Settings
    initLLM();

    // Run the agent
    const result = await centralController.run(taskDescription);

    console.log("\n=== Agent Task Complete ===");
    console.log(result.data.result);

    // Close database connection
    const { client } = await import("./storage/index.js");
    await client.end();
    return;
  }

  // LEGACY: Original workflow-based mode
  const paperPath = args.find((arg) => !arg.startsWith("--"));
  const shouldIntegrate = args.includes("--integrate");

  if (!paperPath) {
    console.error("Usage:");
    console.error("  NEW: node dist/index.js --agent [task description]");
    console.error('  Example: node dist/index.js --agent "Build a KG on NeRF with 10 papers"');
    console.error("");
    console.error("  LEGACY: node dist/index.js <path-to-paper.pdf> [--integrate]");
    process.exit(1);
  }

  // Legacy workflow code
  const path = await import("path");
  const { createEDCWorkflow } = await import("./pipeline/workflow/edcWorkflow.js");
  const { loadEvent, completeEvent } = await import("./pipeline/workflow/events.js");
  const { createIntegrationWorkflow } = await import("./pipeline/workflow/integrationWorkflow.js");
  const {
    integrateEvent,
    integrationCompleteEvent,
  } = await import("./pipeline/workflow/integrationEvents.js");

  initLLM();

  const workflow = createEDCWorkflow();
  const { stream, sendEvent } = workflow.createContext();
  sendEvent(loadEvent.with({ paperPath: path.resolve(paperPath) }));

  let extractedGraph: any = null;

  for await (const event of stream) {
    if (completeEvent.include(event)) {
      const { success, entitiesCount, relationshipsCount, finalGraph } = event.data;

      if (success) {
        console.log("=== EDC Pipeline Complete ===");
        console.log(`✅ Extracted ${entitiesCount} entities`);
        console.log(`✅ Extracted ${relationshipsCount} relationships`);

        if (shouldIntegrate && finalGraph) {
          console.log("\n=== Starting Integration Workflow ===");

          const integrationWorkflow = createIntegrationWorkflow();
          const {
            stream: integrationStream,
            sendEvent: sendIntegrationEvent,
          } = integrationWorkflow.createContext();

          sendIntegrationEvent(
            integrateEvent.with({
              newGraph: finalGraph,
              paperPath: path.resolve(paperPath),
            }),
          );

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
        }
      } else {
        console.log("=== Pipeline Failed ===");
        process.exit(1);
      }

      break;
    }
  }

  const { client } = await import("./storage/index.js");
  await client.end();
}

main().catch(console.error);
