ALTER TABLE "crypto_charges" ADD COLUMN IF NOT EXISTS "confirmations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_charges" ADD COLUMN IF NOT EXISTS "confirmations_required" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "crypto_charges" ADD COLUMN IF NOT EXISTS "tx_hash" text;--> statement-breakpoint
ALTER TABLE "crypto_charges" ADD COLUMN IF NOT EXISTS "amount_received_cents" integer DEFAULT 0 NOT NULL;
