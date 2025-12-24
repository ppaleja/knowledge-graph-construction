ALTER TABLE "entities" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
CREATE INDEX "embeddingIndex" ON "entities" USING hnsw ("embedding" vector_cosine_ops);