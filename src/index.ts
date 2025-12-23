import { PipelineOrchestrator } from "./pipeline/orchestrator.js";
import { initLLM } from "./utils/llm.js";
import * as path from "path";

async function main() {
    const paperPath = process.argv[2];
    if (!paperPath) {
        console.error("Please provide a path to a PDF paper.");
        process.exit(1);
    }

    // Init LlamaIndex Settings
    initLLM();

    const orchestrator = new PipelineOrchestrator();
    await orchestrator.run(path.resolve(paperPath));
}

main().catch(console.error);
