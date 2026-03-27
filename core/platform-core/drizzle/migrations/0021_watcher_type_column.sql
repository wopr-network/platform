ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "watcher_type" text DEFAULT 'evm' NOT NULL;
--> statement-breakpoint
UPDATE "payment_methods" SET "watcher_type" = 'utxo' WHERE "chain" IN ('bitcoin', 'litecoin', 'dogecoin');
