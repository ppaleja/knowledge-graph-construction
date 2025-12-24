import type { Entity } from "../types/domain.js";

/**
 * Generic entity resolution prompt for Phase 1 MVP
 * Used to determine if a new entity should be merged with an existing one
 */
export const entityResolutionPrompt = (
    newEntity: Entity,
    candidates: Entity[]
): string => {
    return `You are an entity resolution expert for a knowledge graph. Your task is to determine if a new entity should be merged with an existing entity or created as a new one.

NEW ENTITY:
- ID: ${newEntity.id}
- Name: ${newEntity.name}
- Type: ${newEntity.type}
- Description: ${newEntity.description || "N/A"}

EXISTING CANDIDATE ENTITIES:
${candidates
            .map(
                (c, idx) => `
${idx + 1}. ID: ${c.id}
   Name: ${c.name}
   Type: ${c.type}
   Description: ${c.description || "N/A"}
`
            )
            .join("\n")}

INSTRUCTIONS:
1. Compare the new entity with each candidate
2. Consider:
   - Name similarity (exact match, abbreviations, synonyms)
   - Type compatibility (must be the same or compatible types)
   - Semantic meaning (do they refer to the same real-world concept?)
3. Decide if the new entity is the SAME as any candidate

RESPONSE FORMAT (JSON only):
{
  "action": "MERGE" | "CREATE",
  "targetId": "<existing entity ID if MERGE, omit if CREATE>",
  "confidence": <0.0 to 1.0>,
  "rationale": "<brief explanation>"
}

EXAMPLES:
- "3DGS" vs "3D Gaussian Splatting" → MERGE (abbreviation)
- "ResNet" vs "Residual Network" → MERGE (synonym)
- "BERT" vs "GPT" → CREATE (different models)
- "Cancer" (Disease) vs "Cancer" (Method) → CREATE (different types)

Return ONLY valid JSON, no additional text.`;
};
