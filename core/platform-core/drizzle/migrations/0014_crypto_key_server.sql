-- Crypto Key Server schema additions.
-- Adds atomic derivation counter + path registry + address log.

-- 1. Add network column to payment_methods (parallel to chain)
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "network" text NOT NULL DEFAULT 'mainnet';
--> statement-breakpoint

-- 2. Add next_index atomic counter to payment_methods
ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "next_index" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- 3. BIP-44 path allocation registry
CREATE TABLE IF NOT EXISTS "path_allocations" (
  "coin_type" integer NOT NULL,
  "account_index" integer NOT NULL,
  "chain_id" text REFERENCES "payment_methods"("id"),
  "xpub" text NOT NULL,
  "allocated_at" text NOT NULL DEFAULT (now()),
  CONSTRAINT "path_allocations_pkey" PRIMARY KEY("coin_type","account_index")
);
--> statement-breakpoint

-- 4. Immutable derived address log
CREATE TABLE IF NOT EXISTS "derived_addresses" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "chain_id" text NOT NULL REFERENCES "payment_methods"("id"),
  "derivation_index" integer NOT NULL,
  "address" text NOT NULL UNIQUE,
  "tenant_id" text,
  "created_at" text NOT NULL DEFAULT (now())
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_derived_addresses_chain" ON "derived_addresses" ("chain_id");
--> statement-breakpoint

-- 5. Backfill next_index + derived_addresses from existing crypto_charges.
-- Guarded: only runs if crypto_charges table exists (fresh deploys won't have it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crypto_charges') THEN
    UPDATE "payment_methods" pm
    SET "next_index" = sub.max_idx + 1
    FROM (
      SELECT "chain", MAX("derivation_index") AS max_idx
      FROM "crypto_charges"
      WHERE "derivation_index" IS NOT NULL
      GROUP BY "chain"
    ) sub
    WHERE pm."chain" = sub."chain" AND sub.max_idx >= pm."next_index";

    INSERT INTO "derived_addresses" ("chain_id", "derivation_index", "address", "tenant_id", "created_at")
    SELECT cc."chain", cc."derivation_index", cc."deposit_address", cc."tenant_id", cc."created_at"
    FROM "crypto_charges" cc
    WHERE cc."deposit_address" IS NOT NULL
      AND cc."derivation_index" IS NOT NULL
      AND cc."chain" IS NOT NULL
    ON CONFLICT ("address") DO NOTHING;
  END IF;
END $$;
