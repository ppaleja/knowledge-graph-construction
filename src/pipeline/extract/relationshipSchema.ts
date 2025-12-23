export const relationshipSchema = {
    type: "object",
    required: ["relationships"],
    properties: {
        relationships: {
            type: "array",
            description: "List of relationships between the provided entities",
            items: {
                type: "object",
                required: ["sourceId", "targetId", "type"],
                properties: {
                    sourceId: {
                        type: "string",
                        description: "ID of the source entity (must match an entity ID)",
                    },
                    targetId: {
                        type: "string",
                        description: "ID of the target entity (must match an entity ID)",
                    },
                    type: {
                        type: "string",
                        enum: ["improves_on", "uses", "evaluated_on", "achieves", "proposes", "addresses", "related_to", "based_on"],
                        description: "Type of relationship",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of the relationship",
                    },
                    confidence: {
                        type: "number",
                        description: "Confidence score (0-1)",
                    },
                    metadata: {
                        type: "object",
                        description: "Additional metadata",
                    },
                },
            },
        },
    },
};
