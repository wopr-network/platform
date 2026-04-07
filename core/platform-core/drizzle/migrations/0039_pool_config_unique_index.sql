-- Replace partial unique index with full unique index so ON CONFLICT (product_slug) works
DROP INDEX IF EXISTS "pool_config_product_slug";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pool_config_product_slug_unique" ON "pool_config" ("product_slug");
