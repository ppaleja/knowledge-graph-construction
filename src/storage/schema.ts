import { pgTable, text, uuid, jsonb, timestamp, vector, index } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
    id: uuid("id").primaryKey().defaultRandom(),
    path: text("path").notNull(),
    checksum: text("checksum"),
    status: text("status").default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
});

export const entities = pgTable("entities", {
    id: text("id").primaryKey(), // We use string IDs from extraction
    name: text("name").notNull(),
    type: text("type").notNull(),
    description: text("description"),
    metadata: jsonb("metadata"),
    embedding: vector("embedding", { dimensions: 768 }),
}, (table) => [
    index("embeddingIndex").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);

export const relationships = pgTable("relationships", {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: text("source_id").notNull().references(() => entities.id, { onDelete: 'cascade' }),
    targetId: text("target_id").notNull().references(() => entities.id, { onDelete: 'cascade' }),
    type: text("type").notNull(),
    description: text("description"),
    metadata: jsonb("metadata"),
});
