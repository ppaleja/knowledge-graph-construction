import { createWorkflow } from "@llamaindex/workflow-core";
import {
    integrateEvent,
    candidatesRetrievedEvent,
    entitiesResolvedEvent,
    integrationCompleteEvent,
    integrationErrorEvent,
    type MergeDecision,
} from "./integrationEvents.js";
import { DrizzleGraphStore } from "../../storage/drizzleStore.js";
import { entityResolutionPrompt } from "../../prompts/integrationPrompts.js";
import type { GraphData, Entity, Relationship } from "../../types/domain.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Phase 1: Integration Workflow - MVP
 * Steps: retrieve candidates → resolve entities → persist
 */
export function createIntegrationWorkflow() {
    const workflow = createWorkflow();

    async function ensureDebugDir() {
        const debugDir = path.resolve("debug");
        try {
            await fs.mkdir(debugDir, { recursive: true });
        } catch {
            // best-effort; ignore
        }
        return debugDir;
    }

    /**
     * Step 1: Retrieve Candidates
     * For each entity in the new graph, fetch similar entities from DB
     */
    workflow.handle([integrateEvent], async (context, event) => {
        const { sendEvent } = context;
        const { newGraph, paperPath } = event.data;

        console.log(`[Integration] Starting for ${paperPath}`);
        console.log(
            `[Integration] Processing ${newGraph.entities.length} entities`,
        );

        try {
            const store = new DrizzleGraphStore();
            await store.init();

            // Fetch candidates for each entity
            const candidates = new Map<string, Entity[]>();
            for (const entity of newGraph.entities) {
                const similar = await store.fetchSimilarEntities(entity);
                if (similar.length > 0) {
                    candidates.set(entity.id, similar);
                    console.log(
                        `[Integration] Found ${similar.length} candidates for "${entity.name}"`,
                    );
                }
            }

            // Do not close connection here as it's shared
            // await store.close();

            console.log(
                `[Integration] Retrieved candidates for ${candidates.size} entities`,
            );
            sendEvent(
                candidatesRetrievedEvent.with({ newGraph, candidates, paperPath }),
            );
        } catch (error) {
            console.error(`[Integration] Error in retrieve step:`, error);
            sendEvent(
                integrationErrorEvent.with({
                    stage: "retrieve",
                    error: (error as Error).message,
                    paperPath,
                }),
            );
        }
    });

    /**
     * Step 2: Entity Resolution
     * Use LLM to decide MERGE or CREATE for each entity with candidates
     */
    workflow.handle([candidatesRetrievedEvent], async (context, event) => {
        const { sendEvent } = context;
        const { newGraph, candidates, paperPath } = event.data;

        console.log(`[Integration] Resolving ${candidates.size} entities with LLM`);

        try {
            // This will use Google's Gemini for resolution (via llamaindex)
            const { Gemini, GEMINI_MODEL } = await import("@llamaindex/google");
            const llm = new Gemini({
                model: GEMINI_MODEL.GEMINI_2_5_FLASH_LATEST,
            });

            const mergeLog: MergeDecision[] = [];
            const idMapping = new Map<string, string>(); // newId -> resolvedId

            // Process each entity that has candidates
            for (const entity of newGraph.entities) {
                const entityCandidates = candidates.get(entity.id);

                if (!entityCandidates || entityCandidates.length === 0) {
                    // No candidates, keep as new
                    idMapping.set(entity.id, entity.id);
                    mergeLog.push({
                        newEntityId: entity.id,
                        action: "CREATE",
                        confidence: 1.0,
                        rationale: "No similar entities found",
                    });
                    continue;
                }

                // Call LLM with resolution prompt
                const prompt = entityResolutionPrompt(entity, entityCandidates);
                const response = await llm.complete({ prompt });

                try {
                    const cleanedJson = response.text.replace(/```json\n?|\n?```/g, "").trim();
                    const decision = JSON.parse(cleanedJson);
                    const mergeDecision: MergeDecision = {
                        newEntityId: entity.id,
                        action: decision.action,
                        targetId: decision.targetId,
                        confidence: decision.confidence,
                        rationale: decision.rationale,
                    };

                    mergeLog.push(mergeDecision);

                    if (decision.action === "MERGE" && decision.targetId) {
                        idMapping.set(entity.id, decision.targetId);
                        console.log(
                            `[Integration] MERGE: "${entity.name}" → "${decision.targetId}" (confidence: ${decision.confidence})`,
                        );
                    } else {
                        idMapping.set(entity.id, entity.id);
                        console.log(
                            `[Integration] CREATE: "${entity.name}" (confidence: ${decision.confidence})`,
                        );
                    }
                } catch (parseError) {
                    console.error(
                        `[Integration] Failed to parse LLM response for ${entity.name}:`,
                        response.text,
                    );
                    // Default to CREATE on parse error
                    idMapping.set(entity.id, entity.id);
                    mergeLog.push({
                        newEntityId: entity.id,
                        action: "CREATE",
                        confidence: 0.0,
                        rationale: "LLM response parse error",
                    });
                }
            }

            // Build resolved graph with updated IDs
            const resolvedEntities: Entity[] = [];
            const mergedIds = new Set<string>();

            for (const entity of newGraph.entities) {
                const resolvedId = idMapping.get(entity.id)!;

                if (resolvedId === entity.id) {
                    // CREATE: keep entity as-is
                    resolvedEntities.push(entity);
                } else {
                    // MERGE: skip this entity (it will merge into existing)
                    mergedIds.add(entity.id);
                }
            }

            // Update relationship IDs to point to resolved entities
            const resolvedRelationships: Relationship[] = newGraph.relationships.map(
                (rel) => ({
                    ...rel,
                    sourceId: idMapping.get(rel.sourceId) || rel.sourceId,
                    targetId: idMapping.get(rel.targetId) || rel.targetId,
                }),
            );

            const resolvedGraph: GraphData = {
                entities: resolvedEntities,
                relationships: resolvedRelationships,
            };

            // Save merge log to debug
            const debugDir = await ensureDebugDir();
            await fs.writeFile(
                path.join(debugDir, "04_integration_log.json"),
                JSON.stringify(mergeLog, null, 2),
            );

            console.log(
                `[Integration] Resolution complete: ${resolvedEntities.length} entities (${mergedIds.size} merged)`,
            );
            sendEvent(
                entitiesResolvedEvent.with({
                    resolvedGraph,
                    mergeLog,
                    paperPath,
                }),
            );
        } catch (error) {
            console.error(`[Integration] Error in resolution step:`, error);
            sendEvent(
                integrationErrorEvent.with({
                    stage: "resolve",
                    error: (error as Error).message,
                    paperPath,
                }),
            );
        }
    });

    /**
     * Step 3: Persist
     * Save the resolved graph to the database
     */
    workflow.handle([entitiesResolvedEvent], async (context, event) => {
        const { sendEvent } = context;
        const { resolvedGraph, mergeLog, paperPath } = event.data;

        console.log(
            `[Integration] Persisting ${resolvedGraph.entities.length} entities`,
        );

        try {
            const store = new DrizzleGraphStore();
            await store.init();
            await store.saveGraph(resolvedGraph);
            // await store.close();

            const merged = mergeLog.filter((d) => d.action === "MERGE").length;
            const created = mergeLog.filter((d) => d.action === "CREATE").length;

            console.log(`[Integration] Successfully saved to database`);
            console.log(`[Integration] Summary: ${merged} merged, ${created} created`);

            sendEvent(
                integrationCompleteEvent.with({
                    success: true,
                    paperPath,
                    entitiesProcessed: mergeLog.length,
                    entitiesMerged: merged,
                    entitiesCreated: created,
                }),
            );
        } catch (error) {
            console.error(`[Integration] Error in persist step:`, error);
            sendEvent(
                integrationErrorEvent.with({
                    stage: "persist",
                    error: (error as Error).message,
                    paperPath,
                }),
            );
        }
    });

    /**
     * Error handler
     */
    workflow.handle([integrationErrorEvent], async (context, event) => {
        const { stage, error, paperPath } = event.data;
        console.error(
            `[Integration] Workflow failed at ${stage} stage for ${paperPath}`,
        );
        console.error(`[Integration] Error: ${error}`);

        context.sendEvent(
            integrationCompleteEvent.with({
                success: false,
                paperPath,
                entitiesProcessed: 0,
                entitiesMerged: 0,
                entitiesCreated: 0,
            }),
        );
    });

    return workflow;
}
