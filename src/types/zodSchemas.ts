import { z } from "zod";

export const EntitySchema = z.object({
  id: z.string().describe("Unique identifier for the entity"),
  name: z.string().describe("Name of the entity"),
  type: z.string().describe("Type of the entity (e.g. Method, Metric, Task)"),
  description: z
    .string()
    .describe("Brief description of the entity")
    .optional(),
  metadata: z
    .record(z.string(), z.any())
    .describe("Additional metadata")
    .optional(),
});

export const RelationshipSchema = z.object({
  sourceId: z.string().describe("ID of the source entity"),
  targetId: z.string().describe("ID of the target entity"),
  type: z.string().describe("Type of relationship (e.g. improves_on, uses)"),
  description: z
    .string()
    .describe("Description of the relationship")
    .optional(),
  metadata: z
    .record(z.string(), z.any())
    .describe("Additional metadata")
    .optional(),
});

export const GraphDataSchema = z.object({
  entities: z
    .array(EntitySchema)
    .describe("List of entities extracted from text"),
  relationships: z
    .array(RelationshipSchema)
    .describe("List of relationships between entities"),
});
