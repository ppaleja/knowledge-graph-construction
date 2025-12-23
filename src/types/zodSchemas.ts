import { z } from "zod";

export const EntitySchema = z.object({
    id: z.string().describe("Unique identifier for the entity (e.g., lowercase name)"),
    name: z.string().describe("Human-readable name of the entity"),
    type: z.string().describe("Category of the entity (e.g., Method, Metric, Dataset)"),
    description: z.string().optional().describe("Brief description of the entity context"),
    metadata: z.record(z.string(), z.any()).optional().describe("Additional metadata"),
});

export const RelationshipSchema = z.object({
    sourceId: z.string().describe("ID of the source entity"),
    targetId: z.string().describe("ID of the target entity"),
    type: z.string().describe("Type of relationship (e.g., improves_on, uses)"),
    description: z.string().optional().describe("Context about this relationship"),
});

export const GraphDataSchema = z.object({
    entities: z.array(EntitySchema).describe("List of extracted entities"),
    relationships: z.array(RelationshipSchema).describe("List of extracted relationships"),
});
