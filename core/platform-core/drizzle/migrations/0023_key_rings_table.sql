-- Key rings: decouples key material from payment methods
CREATE TABLE IF NOT EXISTS "key_rings" (
  "id" text PRIMARY KEY,
  "curve" text NOT NULL,
  "derivation_scheme" text NOT NULL,
  "derivation_mode" text NOT NULL DEFAULT 'on-demand',
  "key_material" text NOT NULL DEFAULT '{}',
  "coin_type" integer NOT NULL,
  "account_index" integer NOT NULL DEFAULT 0,
  "created_at" text NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "key_rings_path_unique" ON "key_rings" ("coin_type", "account_index");
--> statement-breakpoint

-- Pre-derived address pool (for Ed25519 chains)
CREATE TABLE IF NOT EXISTS "address_pool" (
  "id" serial PRIMARY KEY,
  "key_ring_id" text NOT NULL REFERENCES "key_rings"("id"),
  "derivation_index" integer NOT NULL,
  "public_key" text NOT NULL,
  "address" text NOT NULL,
  "assigned_to" text,
  "created_at" text NOT NULL DEFAULT (now())
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "address_pool_ring_index" ON "address_pool" ("key_ring_id", "derivation_index");
--> statement-breakpoint

-- Add new columns to payment_methods
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "key_ring_id" text REFERENCES "key_rings"("id");
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "encoding" text;
--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "plugin_id" text;
