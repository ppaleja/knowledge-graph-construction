import { GeminiEmbedding, GEMINI_EMBEDDING_MODEL } from "@llamaindex/google";
import type { Entity } from "../types/domain.js";

const embedder = new GeminiEmbedding({ model: GEMINI_EMBEDDING_MODEL.EMBEDDING_001 });

/**
 * Generate a vector embedding for a given text using Gemini
 * Dimension: 768
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    return await embedder.getTextEmbedding(text);
}

/**
 * Create a rich text representation of an entity for embedding
 */
export function createEntityText(entity: Pick<Entity, "name" | "type" | "description">): string {
    return `${entity.name} (${entity.type}): ${entity.description || ''}`.trim();
}
