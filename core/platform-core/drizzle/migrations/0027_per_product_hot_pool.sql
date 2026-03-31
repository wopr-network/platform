-- Per-product hot pool: partition warm containers by product slug
ALTER TABLE "pool_instances" ADD COLUMN IF NOT EXISTS "product_slug" text;
--> statement-breakpoint
ALTER TABLE "pool_instances" ADD COLUMN IF NOT EXISTS "image" text;
--> statement-breakpoint

-- Claim query now filters by product_slug
CREATE INDEX IF NOT EXISTS "pool_instances_slug_status_created"
  ON "pool_instances" ("product_slug", "status", "created_at");
--> statement-breakpoint

-- Pool config per product (replaces single id=1 row)
ALTER TABLE "pool_config" ADD COLUMN IF NOT EXISTS "product_slug" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pool_config_product_slug"
  ON "pool_config" ("product_slug") WHERE "product_slug" IS NOT NULL;
--> statement-breakpoint

-- Create sequence for pool_config id if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS "pool_config_id_seq" OWNED BY "pool_config"."id";
--> statement-breakpoint
SELECT setval('pool_config_id_seq', COALESCE((SELECT MAX(id) FROM pool_config), 1));
