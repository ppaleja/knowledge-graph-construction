import { workflowEvent } from "@llamaindex/workflow-core";
import type { GraphData, Entity } from "../../types/domain.js";

/**
 * Triggered to start the integration workflow with a newly extracted graph
 */
export const integrateEvent = workflowEvent<{
    newGraph: GraphData;
    paperPath: string;
}>();

/**
 * Triggered when candidate entities have been retrieved from the database
 * Maps each new entity ID to an array of potential matches
 */
export const candidatesRetrievedEvent = workflowEvent<{
    newGraph: GraphData;
    candidates: Map<string, Entity[]>;
    paperPath: string;
}>();

/**
 * Merge decision for a single entity
 */
export interface MergeDecision {
    newEntityId: string;
    action: "MERGE" | "CREATE";
    targetId?: string; // Existing entity ID if action is MERGE
    confidence?: number;
    rationale?: string;
}

/**
 * Triggered when entities have been resolved (merge decisions made)
 */
export const entitiesResolvedEvent = workflowEvent<{
    resolvedGraph: GraphData;
    mergeLog: MergeDecision[];
    paperPath: string;
}>();

/**
 * Triggered when integration is complete
 */
export const integrationCompleteEvent = workflowEvent<{
    success: boolean;
    paperPath: string;
    entitiesProcessed: number;
    entitiesMerged: number;
    entitiesCreated: number;
}>();

/**
 * Triggered on any error during integration
 */
export const integrationErrorEvent = workflowEvent<{
    stage: string;
    error: string;
    paperPath: string;
}>();
