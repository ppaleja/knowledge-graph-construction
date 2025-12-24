/**
 * Core domain types for the knowledge graph
 * These represent the fundamental building blocks of our graph data model
 */

/**
 * Entity - A node in the knowledge graph
 * Represents a concept, method, metric, task, or any extractable entity from papers
 */
export interface Entity {
  id: string;
  name: string;
  type: string; // e.g., "Method", "Metric", "Task", "Dataset"
  description?: string;
  aliases?: string[]; // Alternative names/abbreviations for entity resolution
  metadata?: Record<string, any>;
}

/**
 * Relationship - An edge in the knowledge graph
 * Represents a connection between two entities
 */
export interface Relationship {
  sourceId: string; // Refers to Entity.id
  targetId: string; // Refers to Entity.id
  type: string; // e.g., "improves_on", "uses", "evaluated_on"
  description?: string;
  confidence?: number; // Confidence score 0.0-1.0
  sourcePaperId?: string; // OpenAlex Work ID for provenance
  metadata?: Record<string, any>;
}

/**
 * GraphData - A complete knowledge graph structure
 * Contains entities, relationships, and metadata about referenced entities
 */
export interface GraphData {
  entities: Entity[];
  relationships: Relationship[];
  referencedEntityIds?: string[]; // IDs of entities in DB referenced by relationships but not in entities array
}
