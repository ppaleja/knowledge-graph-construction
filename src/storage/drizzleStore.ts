import { db, client } from "./index.js";
import { entities, relationships } from "./schema.js";
import type { GraphData, Entity, Relationship } from "#types/domain.js";
import type { IGraphStore } from "#types/interfaces/storage.js";
import { cosineDistance, desc, gt, sql, isNotNull } from 'drizzle-orm';
import { generateEmbedding, createEntityText } from '../utils/embeddings.js';



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
                    const embedding = await generateEmbedding(createEntityText(entity));

                    await tx.insert(entities).values({
                        id: entity.id,
                        name: entity.name,
                        type: entity.type,
                        description: entity.description,
                        metadata: entity.metadata,
                        embedding: embedding
                    }).onConflictDoUpdate({
                        target: entities.id,
                        set: {
                            name: entity.name,
                            type: entity.type,
                            description: entity.description,
                            metadata: entity.metadata,
                            embedding: embedding
                        }
                    });
                }

                // Upsert Relationships
                if (graph.relationships.length > 0) {
                    const validIds = new Set([
                        ...graph.entities.map(e => e.id),
                        ...(graph.referencedEntityIds || [])
                    ]);
                    const validRelationships = graph.relationships.filter(r => {
                        const isValid = validIds.has(r.sourceId) && validIds.has(r.targetId);
                        if (!isValid) {
                            console.warn(`[DrizzleStore] Skipping orphan relationship: ${r.sourceId} -> ${r.targetId} (Entity missing)`);
                        }
                        return isValid;
                    });

                    if (validRelationships.length > 0) {
                        await tx.insert(relationships).values(validRelationships.map(r => ({
                            sourceId: r.sourceId,
                            targetId: r.targetId,
                            type: r.type,
                            description: r.description,
                            metadata: r.metadata
                        })));
                    }
                }
            });
        }
    }

    /**
     * Fetch similar entities from the database for candidate matching
     * Uses ILIKE for fuzzy name matching and exact type matching
     * Phase 1: Text-based retrieval (can upgrade to vector similarity later)
     */
    /**
     * Fetch similar entities from the database for candidate matching
     * Uses Vector Search (Cosine Distance) via pgvector
     */
    async fetchSimilarEntities(entity: Entity): Promise<Entity[]> {
        try {
            const queryEmbedding = await generateEmbedding(createEntityText(entity));

            // 1 - cosineDistance gives similarity (1 = identical, 0 = orthogonal, -1 = opposite)
            // But drizzle's cosineDistance returns distance (lower is better, 0 is identical)
            // Typically we want distance < threshold. 
            // Let's use cosineDistance directly and sort ASC.
            const distance = cosineDistance(entities.embedding, queryEmbedding);

            const candidates = await db
                .select({
                    id: entities.id,
                    name: entities.name,
                    type: entities.type,
                    description: entities.description,
                    metadata: entities.metadata,
                    distance: distance
                })
                .from(entities)
                .where(isNotNull(entities.embedding))
                .orderBy(distance)
                .limit(5);

            // Filter by distance threshold (e.g., < 0.2 for very similar)
            // For now, let's be generous to capture candidates.
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

    /**
     * Batch fetch similar entities for multiple input entities in a single query
     * Optimized to reduce DB round-trips
     */
    /**
     * Batch fetch similar entities for multiple input entities
     * Uses parallel vector searches
     */
    async fetchSimilarEntitiesBatch(inputEntities: Entity[]): Promise<Map<string, Entity[]>> {
        if (inputEntities.length === 0) {
            return new Map();
        }

        const result = new Map<string, Entity[]>();

        // Concurrency limit
        const BATCH_SIZE = 5;
        for (let i = 0; i < inputEntities.length; i += BATCH_SIZE) {
            const batch = inputEntities.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (entity) => {
                const similar = await this.fetchSimilarEntities(entity);
                if (similar.length > 0) {
                    result.set(entity.id, similar);
                }
            }));
        }

        return result;
    }

    async close(): Promise<void> {
        await client.end();
    }
}
