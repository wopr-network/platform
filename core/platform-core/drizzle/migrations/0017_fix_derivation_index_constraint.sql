-- Fix: derivation_index unique constraint was global, not per-chain.
-- DOGE index 1 collided with BTC index 1. Must be (chain, derivation_index).

DROP INDEX IF EXISTS "uq_crypto_charges_derivation_index";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_crypto_charges_chain_derivation" ON "crypto_charges" ("chain", "derivation_index") WHERE "chain" IS NOT NULL AND "derivation_index" IS NOT NULL;
