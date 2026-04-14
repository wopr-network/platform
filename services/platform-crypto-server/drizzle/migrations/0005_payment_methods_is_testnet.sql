-- Add a first-class is_testnet flag to payment_methods so core can filter
-- testnet-network chains out of per-product chain listings. Historically
-- network column was overloaded between chain identity (base, arbitrum)
-- and logical network (mainnet), which makes it unreliable as a testnet
-- predicate.
ALTER TABLE "payment_methods" ADD COLUMN "is_testnet" boolean NOT NULL DEFAULT false;

-- Seed: the only active testnet row today is TON:ton-testnet.
UPDATE "payment_methods" SET "is_testnet" = true WHERE "id" = 'TON:ton-testnet';
