-- Watcher service schema additions: webhook outbox + charge amount tracking.

-- 1. callback_url for webhook delivery
ALTER TABLE "crypto_charges" ADD COLUMN IF NOT EXISTS "callback_url" text;
--> statement-breakpoint

-- 2. Expected crypto amount in native base units (locked at charge creation)
ALTER TABLE "crypto_charges" ADD COLUMN IF NOT EXISTS "expected_amount" text;
--> statement-breakpoint

-- 3. Running total of received crypto in native base units (partial payments)
ALTER TABLE "crypto_charges" ADD COLUMN IF NOT EXISTS "received_amount" text;
--> statement-breakpoint

-- 4. Webhook delivery outbox — durable retry for payment callbacks
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "charge_id" text NOT NULL,
  "callback_url" text NOT NULL,
  "payload" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "next_retry_at" text,
  "last_error" text,
  "created_at" text NOT NULL DEFAULT (now())
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_status" ON "webhook_deliveries" ("status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_charge" ON "webhook_deliveries" ("charge_id");
