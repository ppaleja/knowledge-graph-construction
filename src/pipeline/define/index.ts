import type { IDefiner, GraphData, Entity } from "../../types/domain.js";
import { DEFINE_PROMPT } from "../../prompts/define.js";
import { Settings } from "llamaindex";
import { GraphDataSchema } from "../../types/zodSchemas.js";

export class Definer implements IDefiner {
    name = "The Architect";

    async process(input: GraphData): Promise<GraphData> {
        console.log(`[${this.name}] Refining types for ${input.entities.length} entities...`);
        const llm = Settings.llm;

        // Optimization: Only send entities, relationships don't have "types" in our schema that need strict ontology usually.
        const entitiesJson = JSON.stringify(input.entities.map((n: Entity) => ({ id: n.id, name: n.name, type: n.type })));

        if (input.entities.length === 0) return input;

        const response = await llm.chat({
            messages: [
                { role: "system", content: (DEFINE_PROMPT.format({ entities: "" }).split("Input Entities:")[0] || "") },
                { role: "user", content: `Input Entities:\n${entitiesJson}\n\nReturn JSON: { "entities": [...] }` }
            ],
            additionalChatOptions: { response_format: { type: "json_object" } }
        });

        const rawOutput = response.message.content;
        let refinedEntities: Entity[] = [];
        try {
            const parsed = JSON.parse(typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput));
            // Expecting { entities: [...] }
            if (Array.isArray(parsed.entities)) {
                refinedEntities = parsed.entities;
            } else if (Array.isArray(parsed)) {
                refinedEntities = parsed;
            }
        } catch (e) {
            console.error(`[${this.name}] Failed to parse JSON. Keeping original entities.`);
            return input;
        }

        // Merge refined types back into original entities
        const entityMap = new Map(input.entities.map((n: Entity) => [n.id, n]));

        const finalEntities = refinedEntities.map(refined => {
            const original = entityMap.get(refined.id) || entityMap.get(refined.name) || refined;
            // fallback to refined if original not found
            return {
                ...original,
                type: refined.type, // Update type
                name: refined.name // Update name if corrected
            };
        });

        return {
            entities: finalEntities,
            relationships: input.relationships // Relationships untouched
        };
    }

    async consolidateSchema(graph: GraphData): Promise<void> {
        // Dynamic schema synthesis (future)
    }
}
