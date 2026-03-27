ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "encoding_params" text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
UPDATE "payment_methods" SET "encoding_params" = '{"hrp":"bc"}' WHERE "address_type" = 'bech32' AND "chain" = 'bitcoin';
--> statement-breakpoint
UPDATE "payment_methods" SET "encoding_params" = '{"hrp":"ltc"}' WHERE "address_type" = 'bech32' AND "chain" = 'litecoin';
--> statement-breakpoint
UPDATE "payment_methods" SET "encoding_params" = '{"version":"0x1e"}' WHERE "address_type" = 'p2pkh' AND "chain" = 'dogecoin';
