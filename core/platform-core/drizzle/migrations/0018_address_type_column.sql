-- Add address_type column to payment_methods.
-- Drives derivation routing: "bech32" (BTC/LTC), "p2pkh" (DOGE), "evm" (ETH/ERC20).
-- Eliminates hardcoded chain names in deriveNextAddress.

ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "address_type" text NOT NULL DEFAULT 'evm';
--> statement-breakpoint

-- Set correct values for existing chains
UPDATE "payment_methods" SET "address_type" = 'bech32' WHERE "chain" IN ('bitcoin', 'litecoin');
--> statement-breakpoint

UPDATE "payment_methods" SET "address_type" = 'p2pkh' WHERE "chain" = 'dogecoin';
