import type { GraphData, Entity, Relationship } from "#types/domain.js";
import type { IExtractor } from "#types/interfaces/pipeline.js";
import type { PreparsedPaperContext } from "#types/preparsedContext.js";
import { LlamaExtract } from "llama-cloud-services";
import { entitySchema } from "./entitySchema.js";
import { relationshipSchema } from "./relationshipSchema.js";
import { config } from "#config/index.js";

export class Extractor implements IExtractor {
    name = "[Extractor]";
    private llamaExtract: LlamaExtract;

    constructor() {
        this.llamaExtract = new LlamaExtract(
            config.llamaCloud.apiKey,
            config.llamaCloud.baseUrl,
        );
    }

    async process(text: string, context?: PreparsedPaperContext): Promise<GraphData> {
        console.log(`[${this.name}] Processing text (length: ${text.length})...`);

        if (context) {
            console.log(`[${this.name}] Using preparsed context for paper: "${context.title}"`);
        }

        // Phase 1: Extract entities using LlamaExtract
        console.log(`[${this.name}] Phase 1: Extracting entities...`);
        const entities = await this.extractEntities(text, context);
        console.log(`[${this.name}] Phase 1 complete: ${entities.length} entities extracted`);

        if (entities.length === 0) {
            console.warn(`[${this.name}] No entities extracted, skipping relationship extraction`);
            return { entities: [], relationships: [] };
        }

        // Phase 2: Extract relationships using LLM
        console.log(`[${this.name}] Phase 2: Extracting relationships...`);
        const relationships = await this.extractRelationships(text, entities, context);
        console.log(`[${this.name}] Phase 2 complete: ${relationships.length} relationships extracted`);

        console.log(`[${this.name}] Extraction complete: ${entities.length} entities, ${relationships.length} relationships`);
        return { entities, relationships };
    }

    private async extractEntities(text: string, context?: PreparsedPaperContext): Promise<Entity[]> {
        // Build enhanced instructions with preparsed context
        let instructions = "Extract entities from this academic paper.";

        if (context) {
            instructions += `\n\nPAPER CONTEXT:`;
            instructions += `\nTitle: ${context.title}`;
            instructions += `\nAbstract: ${context.abstract}`;

            if (context.keywords && context.keywords.length > 0) {
                instructions += `\nKeywords: ${context.keywords.join(", ")}`;
            }

            if (context.mainFindings && context.mainFindings.length > 0) {
                instructions += `\n\nMain Findings:`;
                context.mainFindings.forEach((finding: string, i: number) => {
                    instructions += `\n${i + 1}. ${finding}`;
                });
            }

            if (context.methodology?.methods && context.methodology.methods.length > 0) {
                instructions += `\n\nMethods Used: ${context.methodology.methods.join(", ")}`;
            }
        }

        const fileBuffer = Buffer.from(text);
        const extractedData = await this.llamaExtract.extract(
            entitySchema,
            context ? { system_prompt: instructions } : {},
            undefined,
            fileBuffer,
        );

        const resultItem = Array.isArray(extractedData)
            ? extractedData[0]
            : extractedData;

        if (resultItem && "data" in resultItem) {
            const data = resultItem.data as any;
            return data.entities || [];
        }

        return [];
    }

    private async extractRelationships(text: string, entities: Entity[], context?: PreparsedPaperContext): Promise<Relationship[]> {
        // Format entity list as instruction context
        const entityList = entities.map(e =>
            `- ${e.id}: ${e.name} (${e.type})`
        ).join('\n');

        const instructions = `You are extracting relationships between entities from an academic paper.

ENTITY LIST (use these exact IDs for sourceId and targetId):
${entityList}

RELATIONSHIP TYPES:
- improves_on: Method A improves upon Method B
- uses: Method A uses Method/Concept B
- evaluated_on: Method A evaluated on Dataset B
- achieves: Method A achieves Metric B
- proposes: Paper/Author proposes Method A
- addresses: Method A addresses Task B
- related_to: Concept A related to Concept B
- based_on: Method A based on Concept/Method B

CRITICAL: Use ONLY the exact entity IDs from the list above for sourceId and targetId.`;

        // Use LlamaExtract with relationshipSchema
        const fileBuffer = Buffer.from(text);
        const extractedData = await this.llamaExtract.extract(
            relationshipSchema,
            { system_prompt: instructions },
            undefined,
            fileBuffer,
        );

        const resultItem = Array.isArray(extractedData)
            ? extractedData[0]
            : extractedData;

        if (resultItem && "data" in resultItem) {
            const data = resultItem.data as any;
            const relationships = data.relationships || [];

            console.log(`[${this.name}] LlamaExtract returned ${relationships.length} relationships`);

            // Validate entity IDs and filter invalid relationships
            const entityIds = new Set(entities.map(e => e.id));
            const validRelationships = relationships.filter((rel: Relationship) =>
                entityIds.has(rel.sourceId) &&
                entityIds.has(rel.targetId) &&
                rel.sourceId !== rel.targetId
            );

            const filteredCount = relationships.length - validRelationships.length;
            if (filteredCount > 0) {
                console.log(
                    `[${this.name}] Filtered ${filteredCount} relationships with invalid entity IDs`
                );
            }

            return validRelationships;
        }

        return [];
    }
}
