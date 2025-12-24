import { db, client } from "./index.js";
import { entities, relationships } from "./schema.js";
import type { GraphData, Entity, Relationship } from "../types/domain.js";

// Interface must match what Orchestrator expects. 
// Previously: export interface IGraphStore { init(): Promise<void>; saveGraph(graph: GraphData): Promise<void>; close(): Promise<void>; }

export interface IGraphStore {
    init(): Promise<void>;
    saveGraph(graph: GraphData): Promise<void>;
    fetchSimilarEntities(entity: Entity): Promise<Entity[]>;
    close(): Promise<void>;
}

export class DrizzleGraphStore implements IGraphStore {
    async init(): Promise<void> {
        // Drizzle usually handles migrations via CLI (drizzle-kit push or migrate)
        // We can't easily auto-migrate here without running the migration script.
        // For this takehome, we assume the user runs `npx drizzle-kit push` 
        // OR we can trigger it if we want to be fancy, but standard practice is CLI.
        console.log("Initializing Drizzle Store... (Ensure you ran 'npx drizzle-kit push')");
    }

    async saveGraph(graph: GraphData): Promise<void> {
        console.log(`Saving ${graph.entities.length} entities and ${graph.relationships.length} relationships to Drizzle/Supabase...`);

        if (graph.entities.length > 0) {
            await db.transaction(async (tx) => {
                // Upsert Entities
                for (const entity of graph.entities) {
                    await tx.insert(entities).values({
                        id: entity.id,
                        name: entity.name,
                        type: entity.type,
                        description: entity.description,
                        metadata: entity.metadata
                    }).onConflictDoUpdate({
                        target: entities.id,
                        set: {
                            name: entity.name,
                            type: entity.type,
                            description: entity.description,
                            metadata: entity.metadata
                        }
                    });
                }

                // Upsert Relationships
                if (graph.relationships.length > 0) {
                    await tx.insert(relationships).values(graph.relationships.map(r => ({
                        sourceId: r.sourceId,
                        targetId: r.targetId,
                        type: r.type,
                        description: r.description,
                        metadata: r.metadata
                    })));
                }
            });
        }
    }

    /**
     * Fetch similar entities from the database for candidate matching
     * Uses ILIKE for fuzzy name matching and exact type matching
     * Phase 1: Text-based retrieval (can upgrade to vector similarity later)
     */
    async fetchSimilarEntities(entity: Entity): Promise<Entity[]> {
        const { ilike, eq, or, sql } = await import("drizzle-orm");

        try {
            // Search for entities with similar names OR same type
            // ILIKE is case-insensitive pattern matching
            const candidates = await db
                .select()
                .from(entities)
                .where(
                    or(
                        ilike(entities.name, `%${entity.name}%`),
                        eq(entities.type, entity.type)
                    )
                )
                .limit(5);

            // Filter out the exact same ID and map to Entity type
            return candidates
                .filter(c => c.id !== entity.id)
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    type: c.type,
                    ...(c.description !== null && { description: c.description }),
                    ...(c.metadata !== null && { metadata: c.metadata as Record<string, any> }),
                }));
        } catch (error) {
            console.error(`[DrizzleStore] Error fetching similar entities:`, error);
            return [];
        }
    }

    async close(): Promise<void> {
        await client.end();
    }
}
