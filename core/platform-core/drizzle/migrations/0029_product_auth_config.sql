-- Per-product OAuth configuration
-- Client IDs are public (used in browser redirects). Client secrets stay in Vault.
CREATE TABLE IF NOT EXISTS "product_auth_config" (
  "id" serial PRIMARY KEY,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "client_id" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("product_id", "provider")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_auth_config_product" ON "product_auth_config" ("product_id");
