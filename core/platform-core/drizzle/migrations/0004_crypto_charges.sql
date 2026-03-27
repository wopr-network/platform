-- Replace payram_charges with crypto_charges (BTCPay Server).
-- payram_charges existed only in the initial schema (0000) and was never used
-- in production — no data migration is needed. The table is dropped and replaced
-- with crypto_charges which has the same column structure but uses BTCPay-specific
-- naming (reference_id = BTCPay invoice ID).
--> statement-breakpoint
DROP TABLE IF EXISTS "payram_charges";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crypto_charges" (
	"reference_id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"amount_usd_cents" integer NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"currency" text,
	"filled_amount" text,
	"created_at" text DEFAULT (now()) NOT NULL,
	"updated_at" text DEFAULT (now()) NOT NULL,
	"credited_at" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_crypto_charges_tenant" ON "crypto_charges" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_crypto_charges_status" ON "crypto_charges" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_crypto_charges_created" ON "crypto_charges" USING btree ("created_at");
