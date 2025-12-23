import { PromptTemplate } from "llamaindex";

export const RELATIONSHIP_EXTRACTION_PROMPT = new PromptTemplate({
    template: `
You are "The Weaver", a Relationship Extraction Agent for academic knowledge graphs.

Given the text and a list of extracted entities, identify relationships between them.

Entities (with IDs):
{entities}

Relationship Types:
- improves_on: Method A improves upon Method B
- uses: Method A uses Method/Concept B
- evaluated_on: Method A evaluated on Dataset B
- achieves: Method A achieves Metric B (with performance values)
- proposes: Paper/Author proposes Method A
- addresses: Method A addresses Task B
- related_to: Concept A related to Concept B
- based_on: Method A based on Concept/Method B

Instructions:
1. Only use entity IDs from the provided list
2. Look for explicit relationships ("X outperforms Y", "X uses Y for...")
3. Look for implicit relationships (method evaluated on dataset = evaluated_on)
4. Handle negation: "X does not improve Y" → do NOT create relationship
5. Be specific: prefer "improves_on" over generic "related_to"
6. For "achieves" relationships, include metric values in description if available

Text:
{text}

Output JSON with "relationships" array.
    `,
});
