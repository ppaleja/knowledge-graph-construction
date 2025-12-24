import type { ICanonicalizer, GraphData, Entity, Relationship } from "../../types/domain.js";
import { CANONICALIZE_PROMPT } from "../../prompts/canonicalize.js";
import { Settings } from "llamaindex";

export class Canonicalizer implements ICanonicalizer {
    name = "[Deduplicator]";

    async process(input: GraphData): Promise<GraphData> {
        console.log(`[${this.name}] Resolving ${input.entities.length} entities...`);

        // 1. Simple Dedup by exact name (case-insensitive)
        const uniqueEntities = new Map<string, Entity>();
        const idRemap = new Map<string, string>(); // oldId -> newId

        for (const entity of input.entities) {
            if (!entity.name) {
                continue;
            }
            const key = entity.name.toLowerCase();
            if (uniqueEntities.has(key)) {
                const existing = uniqueEntities.get(key)!;
                console.log(`[${this.name}] Merging '${entity.name}' into '${existing.name}'`);
                idRemap.set(entity.id, existing.id);
            } else {
                uniqueEntities.set(key, entity);
            }
        }

        // 2. (Optional) LLM-based pairwise check could go here for "fuzzy" matches
        // For fast POC, we skip O(N^2) LLM calls.

        const resolvedEntities = Array.from(uniqueEntities.values());

        // 3. Update Relationships
        const resolvedRelationships = input.relationships.map((rel: Relationship) => {
            const newSource = idRemap.get(rel.sourceId) || rel.sourceId;
            const newTarget = idRemap.get(rel.targetId) || rel.targetId;
            return { ...rel, sourceId: newSource, targetId: newTarget };
        }).filter((rel: Relationship) => rel.sourceId !== rel.targetId); // Remove self-loops if any

        console.log(`[${this.name}] Reduced to ${resolvedEntities.length} entities from ${input.entities.length}.`);

        return {
            entities: resolvedEntities,
            relationships: resolvedRelationships
        };
    }

    async resolveEntities(nodes: Entity[]): Promise<Entity[]> {
        return nodes;
    }
}
