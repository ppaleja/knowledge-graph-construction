import { tool } from "llamaindex";
import { z } from "zod";
import { DrizzleGraphStore } from "#storage/drizzleStore.js";
import type { Entity } from "#types/domain.js";

/**
 * TOOL: Query the knowledge graph
 */
export const queryKGTool = tool({
    name: "queryKnowledgeGraph",
    description:
        "Query the knowledge graph to find entities by name or type. Returns matching entities from the database.",
    parameters: z.object({
        searchTerm: z
            .string()
            .describe("Entity name or type to search for"),
        limit: z.number().default(10).describe("Maximum number of results"),
    }),
    execute: async ({ searchTerm, limit }) => {
        const store = new DrizzleGraphStore();
        await store.init();

        // Use the existing fetchSimilarEntities with a dummy entity
        const dummyEntity: Entity = {
            id: "query",
            name: searchTerm,
            type: searchTerm,
        };

        const results = await store.fetchSimilarEntities(dummyEntity);

        // Convert to plain objects
        return {
            entities: results.slice(0, limit).map(e => ({
                id: e.id,
                name: e.name,
                type: e.type,
                description: e.description || "",
            })),
            count: results.length,
        };
    },
});

/**
 * TOOL: Get knowledge graph statistics
 */
export const summarizeKGTool = tool({
    name: "summarizeKnowledgeGraph",
    description:
        "Get summary statistics about the current knowledge graph, including total entities, relationships, and key entity types.",
    parameters: z.object({}),
    execute: async () => {
        const store = new DrizzleGraphStore();
        await store.init();

        // Query database for stats
        const { db } = await import("../../storage/index.js");
        const { entities, relationships } = await import(
            "../../storage/schema.js"
        );
        const { count, sql } = await import("drizzle-orm");

        const [entityCount] = await db
            .select({ count: count() })
            .from(entities);

        const [relationshipCount] = await db
            .select({ count: count() })
            .from(relationships);

        // Get top entity types
        const topTypes = await db
            .select({
                type: entities.type,
                count: count(),
            })
            .from(entities)
            .groupBy(entities.type)
            .orderBy(sql`count(*) DESC`)
            .limit(10);

        return {
            totalEntities: entityCount?.count || 0,
            totalRelationships: relationshipCount?.count || 0,
            topEntityTypes: topTypes.map((t) => ({
                type: t.type,
                count: t.count,
            })),
            summary: `Knowledge graph contains ${entityCount?.count || 0} entities and ${relationshipCount?.count || 0} relationships.`,
        };
    },
});
