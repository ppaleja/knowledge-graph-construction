import { tool } from "llamaindex";
import { z } from "zod";
import { createEDCWorkflow } from "../../pipeline/workflow/edcWorkflow.js";
import { createIntegrationWorkflow } from "../../pipeline/workflow/integrationWorkflow.js";
import { loadEvent, completeEvent } from "../../pipeline/workflow/events.js";
import {
    integrateEvent,
    integrationCompleteEvent,
} from "../../pipeline/workflow/integrationEvents.js";
import type { GraphData, Entity, Relationship } from "../../types/domain.js";

export interface ProcessPaperResult {
    success: boolean;
    entities: Entity[];
    relationships: Relationship[];
    stats: {
        entitiesExtracted: number;
        relationshipsExtracted: number;
        entitiesMerged: number;
        entitiesCreated: number;
    };
}

/**
 * TOOL: Process a single paper through EDC + Integration pipeline
 * Combines extraction, refinement, canonicalization, and KG integration
 */
export const processPaperTool = tool({
    name: "processPaper",
    description:
        "Process an academic paper through the full pipeline: extract entities/relationships, refine types, deduplicate, and integrate into the knowledge graph. Returns the final graph data and statistics.",
    parameters: z.object({
        paperPath: z
            .string()
            .describe("Absolute path to the PDF paper to process"),
    }),
    execute: async ({ paperPath }) => {
        console.log(`
[processPaper] Starting for: ${paperPath}`);

        // Step 1: Run EDC workflow
        const edcWorkflow = createEDCWorkflow();
        const { stream: edcStream, sendEvent: sendEDCEvent } =
            edcWorkflow.createContext();

        sendEDCEvent(loadEvent.with({ paperPath }));

        let extractedGraph: GraphData | null = null;
        let entitiesCount = 0;
        let relationshipsCount = 0;

        for await (const event of edcStream) {
            if (completeEvent.include(event)) {
                const { success, finalGraph } = event.data;
                if (!success || !finalGraph) {
                    throw new Error("EDC pipeline failed");
                }
                extractedGraph = finalGraph;
                entitiesCount = finalGraph.entities.length;
                relationshipsCount = finalGraph.relationships.length;
                break;
            }
        }

        if (!extractedGraph) {
            throw new Error("No graph extracted from EDC workflow");
        }

        console.log(
            `[processPaper] EDC complete: ${entitiesCount} entities, ${relationshipsCount} relationships`
        );

        // Step 2: Run Integration workflow
        const integrationWorkflow = createIntegrationWorkflow();
        const { stream: integrationStream, sendEvent: sendIntegrationEvent } =
            integrationWorkflow.createContext();

        sendIntegrationEvent(
            integrateEvent.with({
                newGraph: extractedGraph,
                paperPath,
            })
        );

        let mergedCount = 0;
        let createdCount = 0;
        let resolvedGraph: GraphData | null = null;

        for await (const event of integrationStream) {
            if (integrationCompleteEvent.include(event)) {
                const { success, entitiesMerged, entitiesCreated, resolvedGraph: rGraph } =
                    event.data;
                if (!success) {
                    throw new Error("Integration pipeline failed");
                }
                mergedCount = entitiesMerged;
                createdCount = entitiesCreated;
                resolvedGraph = rGraph || extractedGraph;
                break;
            }
        }

        console.log(
            `[processPaper] Integration complete: ${mergedCount} merged, ${createdCount} created`
        );

        // Return JSON-serializable data
        return {
            success: true,
            entitiesExtracted: entitiesCount,
            relationshipsExtracted: relationshipsCount,
            entitiesMerged: mergedCount,
            entitiesCreated: createdCount,
        };
    },
});
