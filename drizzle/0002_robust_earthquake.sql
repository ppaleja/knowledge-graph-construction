ALTER TABLE "entities" ADD COLUMN "aliases" jsonb;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "created_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "relationships" ADD COLUMN "confidence" numeric;--> statement-breakpoint
ALTER TABLE "relationships" ADD COLUMN "source_paper_id" text;--> statement-breakpoint
ALTER TABLE "relationships" ADD COLUMN "created_at" timestamp DEFAULT now();