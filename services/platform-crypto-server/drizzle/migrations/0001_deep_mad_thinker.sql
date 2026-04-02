ALTER TABLE "crypto_charges" ADD COLUMN IF NOT EXISTS "seen_tx_hashes" text[] NOT NULL DEFAULT '{}'::text[];
