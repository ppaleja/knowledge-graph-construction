import type { GraphData, Entity } from "../domain.js";

/**
 * Graph storage interface
 * Defines the contract for persisting and querying the knowledge graph
 */
export interface IGraphStore {
    /**
     * Initialize the graph store (e.g., run migrations, create tables)
     */
    init(): Promise<void>;

    /**
     * Save a graph (entities and relationships) to persistent storage
     * Uses upsert semantics - existing entities are updated, new ones created
     */
    saveGraph(graph: GraphData): Promise<void>;

    /**
     * Fetch similar entities from the database for entity resolution
     * Uses vector similarity search to find candidates for deduplication
     */
    fetchSimilarEntities(entity: Entity): Promise<Entity[]>;

    /**
     * Batch version of fetchSimilarEntities for efficiency
     * Returns a map of entity ID to similar entities
     */
    fetchSimilarEntitiesBatch(entities: Entity[]): Promise<Map<string, Entity[]>>;

    /**
     * Close the database connection
     */
    close(): Promise<void>;
}
