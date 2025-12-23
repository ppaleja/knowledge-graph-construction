import type { IExtractor, GraphData } from "../../types/domain.js";
import { EXTRACT_PROMPT } from "../../prompts/extract.js";
import { Settings } from "llamaindex";
import { GraphDataSchema } from "#types/zodSchemas.js";

export class Extractor implements IExtractor {
  name = "The Dreamer";

  async process(text: string): Promise<GraphData> {
    console.log(`[${this.name}] Processing text (length: ${text.length})...`);

    const llm = Settings.llm;
    const formattedPrompt = EXTRACT_PROMPT.format({ text: text });

    try {
      // Method 1: Try llm.exec with structured output (LlamaIndex recommended API)
      if (typeof (llm as any).exec === "function") {
        console.log(`[${this.name}] Using llm.exec with structured output...`);
        const { object } = await (llm as any).exec({
          messages: [{ role: "user", content: formattedPrompt }],
          responseFormat: GraphDataSchema,
        });
        console.log(
          `[${this.name}] Extracted ${object.entities?.length || 0} entities and ${object.relationships?.length || 0} relationships.`,
        );
        return object as unknown as GraphData;
      }
    } catch (execError) {
      console.warn(
        `[${this.name}] llm.exec failed, falling back to regular chat:`,
        (execError as Error).message,
      );
    }

    // Method 2: Fallback to plain chat and manual JSON parsing
    console.log(
      `[${this.name}] Using fallback llm.chat with manual JSON parsing...`,
    );
    const response = await llm.chat({
      messages: [
        {
          role: "user",
          content: formattedPrompt + "\n\nRespond with valid JSON only.",
        },
      ],
    });

    const rawOutput = response.message.content;
    console.log(
      `[${this.name}] Raw LLM output (first 500 chars):`,
      typeof rawOutput === "string" ? rawOutput.substring(0, 500) : rawOutput,
    );
    let jsonData: any;

    if (typeof rawOutput === "string") {
      // Clean markdown code blocks if present
      const jsonMatch =
        rawOutput.match(/```json\s*([\s\S]*?)\s*```/) ||
        rawOutput.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr =
        jsonMatch && jsonMatch[1] ? jsonMatch[1].trim() : rawOutput.trim();
      try {
        jsonData = JSON.parse(jsonStr);
      } catch (e) {
        console.error(
          `[${this.name}] JSON Parse Error. Raw output:`,
          rawOutput.substring(0, 500),
        );
        return { entities: [], relationships: [] };
      }
    } else {
      jsonData = rawOutput;
    }

    // Validate and map to ensure GraphData shape
    // Handle different key names the LLM might use
    if (jsonData) {
      // Support both 'entities' (preferred) and 'nodes' (legacy/alt)
      const extractedEntities = Array.isArray(jsonData.entities)
        ? jsonData.entities
        : Array.isArray(jsonData.nodes)
          ? jsonData.nodes
          : [];
      const extractedRelationships = Array.isArray(jsonData.relationships)
        ? jsonData.relationships
        : Array.isArray(jsonData.edges)
          ? jsonData.edges
          : [];

      const validEntities = extractedEntities
        .map((n: any) => ({
          id: n.id || n.name,
          name: n.name || n.id,
          type: n.type || "Concept",
          description: n.description || "",
          metadata: n.metadata,
        }))
        .filter((n: any) => n.name && typeof n.name === "string");

      const validRelationships = extractedRelationships
        .map((e: any) => ({
          sourceId: e.sourceId || e.source,
          targetId: e.targetId || e.target,
          type: e.type || e.relation || "related_to",
          description: e.description,
          metadata: e.metadata,
        }))
        .filter((e: any) => e.sourceId && e.targetId && e.type);

      console.log(
        `[${this.name}] Extracted ${validEntities.length} entities and ${validRelationships.length} relationships.`,
      );
      return {
        entities: validEntities,
        relationships: validRelationships,
      } as GraphData;
    }

    return { entities: [], relationships: [] };
  }
}
