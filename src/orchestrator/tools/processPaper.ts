import { tool } from "llamaindex";
import { z } from "zod";
import { createEDCWorkflow } from "#pipeline/workflow/edcWorkflow.js";
import { createIntegrationWorkflow } from "#pipeline/workflow/integrationWorkflow.js";
import { loadEvent, completeEvent } from "#pipeline/workflow/events.js";
import {
    integrateEvent,
    integrationCompleteEvent,
} from "#pipeline/workflow/integrationEvents.js";
import type { GraphData, Entity, Relationship } from "#types/domain.js";

// Add index signature to satisfy JSON compatibility if needed, though usually tool returns are flexible.
// We make it explicit:
export interface ProcessPaperResult {
    success: boolean;
    error?: string;
    entities: Entity[];
    relationships: Relationship[];
    stats: {
        entitiesExtracted: number;
        relationshipsExtracted: number;
        entitiesMerged: number;
        entitiesCreated: number;
    };
    [key: string]: any;
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
        sourcePaperId: z
            .string()
            .optional()
            .describe("OpenAlex Work ID (e.g., W12345678) for provenance tracking"),
    }),
    execute: async ({ paperPath, sourcePaperId }): Promise<ProcessPaperResult> => {
        console.log(`
[processPaper] Starting for: ${paperPath}`);

        try {
            // Step 1: Run EDC workflow
            const edcWorkflow = createEDCWorkflow();
            const { stream: edcStream, sendEvent: sendEDCEvent } =
                edcWorkflow.createContext();

            sendEDCEvent(loadEvent.with({ paperPath }));

            let extractedGraph: GraphData | null = null;
            let entitiesCount = 0;
            let relationshipsCount = 0;
            let edcError: string | undefined;

            for await (const event of edcStream) {
                if (completeEvent.include(event)) {
                    const { success, finalGraph, error } = event.data;
                    // Check for explicit error in event payload
                    if (!success || error) {
                        edcError = error || "EDC pipeline failed (unknown error)";
                        break;
                    }
                    if (!finalGraph) {
                        edcError = "No graph extracted from EDC workflow";
                        break;
                    }

                    extractedGraph = finalGraph;
                    entitiesCount = finalGraph.entities.length;
                    relationshipsCount = finalGraph.relationships.length;
                    break;
                }
            }

            if (edcError || !extractedGraph) {
                console.error(`[processPaper] EDC Failed: ${edcError}`);
                return {
                    success: false,
                    error: edcError || "EDC Failed", // Ensure string
                    entities: [],
                    relationships: [],
                    stats: { entitiesExtracted: 0, relationshipsExtracted: 0, entitiesMerged: 0, entitiesCreated: 0 }
                };
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
                    ...(sourcePaperId && { sourcePaperId }),
                })
            );

            let mergedCount = 0;
            let createdCount = 0;
            let integrationError: string | undefined;

            for await (const event of integrationStream) {
                if (integrationCompleteEvent.include(event)) {
                    const { success, entitiesMerged, entitiesCreated, error } = event.data;

                    if (!success || error) {
                        integrationError = error || "Integration pipeline failed";
                        break;
                    }

                    mergedCount = entitiesMerged;
                    createdCount = entitiesCreated;
                    break;
                }
            }

            if (integrationError) {
                console.error(`[processPaper] Integration Failed: ${integrationError}`);
                return {
                    success: false,
                    error: integrationError || "Integration Failed",
                    entities: extractedGraph.entities,
                    relationships: extractedGraph.relationships, // Return what we got so far
                    stats: { entitiesExtracted: entitiesCount, relationshipsExtracted: relationshipsCount, entitiesMerged: 0, entitiesCreated: 0 }
                };
            }

            console.log(
                `[processPaper] Integration complete: ${mergedCount} merged, ${createdCount} created`
            );

            // Return JSON-serializable data
            return {
                success: true,
                entities: extractedGraph.entities,
                relationships: extractedGraph.relationships,
                stats: {
                    entitiesExtracted: entitiesCount,
                    relationshipsExtracted: relationshipsCount,
                    entitiesMerged: mergedCount,
                    entitiesCreated: createdCount,
                },
            };

        } catch (err: any) {
            // Catch unexpected crashes (e.g. out of memory, unhandled throw)
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[processPaper] Critical Error: ${msg}`);
            return {
                success: false,
                error: `Critical tool failure: ${msg}`,
                entities: [],
                relationships: [],
                stats: { entitiesExtracted: 0, relationshipsExtracted: 0, entitiesMerged: 0, entitiesCreated: 0 }
            };
        }
    },
});
