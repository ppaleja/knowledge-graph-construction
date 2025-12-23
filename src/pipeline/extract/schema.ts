export const dataSchema = {
    type: "object",
    required: ["entities", "relationships"],
    properties: {
        entities: {
            type: "array",
            description: "List of entities extracted from text",
            items: {
                type: "object",
                required: ["id", "name", "type"],
                properties: {
                    id: {
                        type: "string",
                        description: "Unique identifier for the entity",
                    },
                    name: {
                        type: "string",
                        description: "Name of the entity",
                    },
                    type: {
                        type: "string",
                        description: "Type of the entity (e.g. Method, Metric, Task)",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of the entity",
                    },
                    metadata: {
                        type: "object",
                        description: "Additional metadata",
                    },
                },
            },
        },
        relationships: {
            type: "array",
            description: "List of relationships between entities",
            items: {
                type: "object",
                required: ["sourceId", "targetId", "type"],
                properties: {
                    sourceId: {
                        type: "string",
                        description: "ID of the source entity",
                    },
                    targetId: {
                        type: "string",
                        description: "ID of the target entity",
                    },
                    type: {
                        type: "string",
                        description: "Type of relationship (e.g. improves_on, uses)",
                    },
                    description: {
                        type: "string",
                        description: "Description of the relationship",
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
