import type { IDefiner, GraphData, Entity } from "../../types/domain.js";
import { DEFINE_PROMPT } from "../../prompts/define.js";
import { Settings } from "llamaindex";

export class Definer implements IDefiner {
    name = "The Architect";

    async process(input: GraphData): Promise<GraphData> {
        console.log(`[${this.name}] Refining types for ${input.entities.length} entities...`);
        const llm = Settings.llm;

        if (input.entities.length === 0) return input;

        // Batch processing to avoid token limits and improve reliability
        const BATCH_SIZE = 50;
        const refinedEntities: Entity[] = [];

        for (let i = 0; i < input.entities.length; i += BATCH_SIZE) {
            const batch = input.entities.slice(i, i + BATCH_SIZE);
            console.log(`[${this.name}] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(input.entities.length / BATCH_SIZE)} (${batch.length} entities)`);

            // Optimization: Only send necessary fields
            const entitiesJson = JSON.stringify(batch.map((n: Entity) => ({ id: n.id, name: n.name, type: n.type })));

            try {
                const response = await llm.chat({
                    messages: [
                        { role: "system", content: (DEFINE_PROMPT.format({ entities: "" }).split("Input Entities:")[0] || "") },
                        { role: "user", content: `Input Entities:\n${entitiesJson}\n\nReturn JSON: { "entities": [...] }` }
                    ],
                    additionalChatOptions: { response_format: { type: "json_object" } }
                });

                const rawOutput = response.message.content;
                let batchRefined: Entity[] = [];

                try {
                    const parsed = JSON.parse(typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput));
                    if (Array.isArray(parsed.entities)) {
                        batchRefined = parsed.entities;
                    } else if (Array.isArray(parsed)) {
                        batchRefined = parsed;
                    }

                    if (batchRefined.length > 0) {
                        refinedEntities.push(...batchRefined);
                    } else {
                        console.warn(`[${this.name}] Batch produced no entities. Keeping originals.`);
                        refinedEntities.push(...batch);
                    }

                } catch (e) {
                    console.error(`[${this.name}] Failed to parse JSON for batch ${Math.floor(i / BATCH_SIZE) + 1}. Error: ${e}`);
                    console.error(`[${this.name}] Raw output start: ${typeof rawOutput === 'string' ? rawOutput.substring(0, 100) : 'Not a string'}`);
                    // Fallback to original batch
                    refinedEntities.push(...batch);
                }
            } catch (llmError) {
                console.error(`[${this.name}] LLM error for batch ${Math.floor(i / BATCH_SIZE) + 1}: ${llmError}`);
                refinedEntities.push(...batch);
            }
        }

        // Merge refined types back into original entities
        const entityMap = new Map(input.entities.map((n: Entity) => [n.id, n]));

        const finalEntities = refinedEntities.map(refined => {
            const original = entityMap.get(refined.id) || entityMap.get(refined.name) || refined;
            return {
                ...original,
                type: refined.type,
                name: refined.name
            };
        });

        return {
            entities: finalEntities,
            relationships: input.relationships
        };
    }


    async consolidateSchema(graph: GraphData): Promise<void> {
        // Dynamic schema synthesis (future)
    }
}
