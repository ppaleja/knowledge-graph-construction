export const entitySchema = {
    type: "object",
    required: ["entities"],
    properties: {
        entities: {
            type: "array",
            description: "List of entities extracted from academic paper text",
            items: {
                type: "object",
                required: ["id", "name", "type"],
                properties: {
                    id: {
                        type: "string",
                        description: "Unique identifier for the entity (use normalized form, e.g., '3dgs' for '3D Gaussian Splatting')",
                    },
                    name: {
                        type: "string",
                        description: "Human-readable name of the entity as it appears in text",
                    },
                    type: {
                        type: "string",
                        enum: ["Method", "Metric", "Task", "Dataset", "Concept", "Author", "Conference"],
                        description: "Entity type category",
                    },
                    description: {
                        type: "string",
                        description: "Brief description of what this entity is",
                    },
                    aliases: {
                        type: "array",
                        items: { type: "string" },
                        description: "Alternative names or abbreviations (e.g., ['3DGS', '3D Gaussian Splatting'])",
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
