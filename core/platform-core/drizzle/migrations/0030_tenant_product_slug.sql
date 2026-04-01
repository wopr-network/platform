-- Add product_slug to tenants so we know which product each tenant belongs to.
-- Tenant + product is the source of truth — clients never pass the product.
ALTER TABLE "tenants" ADD COLUMN "product_slug" text;
--> statement-breakpoint
CREATE INDEX "idx_tenants_product" ON "tenants" ("product_slug");
