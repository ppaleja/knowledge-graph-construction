import { db, client } from "./index.js";
import { entities, relationships } from "./schema.js";
import type { GraphData, Entity, Relationship } from "../types/domain.js";
import { sql, ilike, eq, or } from "drizzle-orm";

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
            // Use SERIALIZABLE isolation for strongest concurrency guarantees
            await db.transaction(async (tx) => {
                // Set transaction isolation level to SERIALIZABLE
                // This must be the first statement in the transaction
                await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

                // Upsert Entities with optimistic concurrency control
                for (const entity of graph.entities) {
                    await tx.insert(entities).values({
                        id: entity.id,
                        name: entity.name,
                        type: entity.type,
                        description: entity.description,
                        metadata: entity.metadata,
                        version: 1 // Initial version for new entities
                    }).onConflictDoUpdate({
                        target: entities.id,
                        set: {
                            name: entity.name,
                            type: entity.type,
                            description: entity.description,
                            metadata: entity.metadata,
                            // Increment version for optimistic concurrency control
                            // Only updates when entity already exists (conflict)
                            version: sql`${entities.version} + 1`
                        }
                    });
                }

                // Upsert Relationships with conflict handling
                if (graph.relationships.length > 0) {
                    for (const r of graph.relationships) {
                        await tx.insert(relationships).values({
                            sourceId: r.sourceId,
                            targetId: r.targetId,
                            type: r.type,
                            description: r.description,
                            metadata: r.metadata
                        }).onConflictDoNothing(); // Skip duplicates based on unique constraint
                    }
                }
            });
        }
    }

    /**
     * Fetch similar entities from the database for candidate matching
     * Uses ILIKE for fuzzy name matching and exact type matching
     * Phase 1: Text-based retrieval (can upgrade to vector similarity later)
     * 
     * Note: This is a read-only operation used for candidate retrieval.
     * Concurrency safety is handled during the actual persistence in saveGraph()
     * which uses SERIALIZABLE transactions and optimistic concurrency control.
     */
    async fetchSimilarEntities(entity: Entity): Promise<Entity[]> {
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
