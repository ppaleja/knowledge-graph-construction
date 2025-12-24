import type { GraphData, Entity } from "#types/domain.js";
import type { IDefiner } from "#types/interfaces/pipeline.js";
import { DEFINE_PROMPT } from "#prompts/define.js";
import { Settings } from "llamaindex";

export class Definer implements IDefiner {
    name = "[TypeRefiner]";

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
                    let cleanedOutput = rawOutput;
                    if (typeof rawOutput === 'string') {
                        cleanedOutput = rawOutput
                            .replace(/^```json\s*/, "")
                            .replace(/^```\s*/, "")
                            .replace(/\s*```$/, "")
                            .trim();
                    }

                    const parsed = JSON.parse(typeof cleanedOutput === 'string' ? cleanedOutput : JSON.stringify(cleanedOutput));
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
                    // Propagate error up the stack
                    throw new Error(`[${this.name}] Failed to parse JSON for batch ${Math.floor(i / BATCH_SIZE) + 1}. Raw output: ${typeof rawOutput === 'string' ? rawOutput.substring(0, 50) + "..." : "Not a string"}. Error: ${e}`);
                }
            } catch (llmError) {
                // Propagate LLM errors (network, etc)
                throw new Error(`[${this.name}] LLM error for batch ${Math.floor(i / BATCH_SIZE) + 1}: ${llmError}`);
            }
        }

        // Merge refined types back into original entities
        const refinedMap = new Map(refinedEntities.map((r: Entity) => [r.id, r]));

        // Validation warning
        if (refinedEntities.length !== input.entities.length) {
            console.warn(`[${this.name}] LLM returned ${refinedEntities.length} entities, expected ${input.entities.length}`);
        }

        // Ensure ALL original entities are preserved
        const finalEntities = input.entities.map((original: Entity) => {
            const refined = refinedMap.get(original.id);
            if (refined) {
                return { ...original, type: refined.type, name: refined.name };
            } else {
                console.warn(`[${this.name}] Entity "${original.name}" not returned by LLM. Keeping original.`);
                return original;
            }
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
