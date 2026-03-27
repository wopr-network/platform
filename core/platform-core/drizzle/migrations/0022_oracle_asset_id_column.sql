ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "oracle_asset_id" text;
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'bitcoin' WHERE "token" = 'BTC';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'ethereum' WHERE "token" = 'ETH';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'dogecoin' WHERE "token" = 'DOGE';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'litecoin' WHERE "token" = 'LTC';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'tron' WHERE "token" = 'TRX';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'binancecoin' WHERE "token" = 'BNB';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'matic-network' WHERE "token" = 'POL';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'avalanche-2' WHERE "token" = 'AVAX';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'chainlink' WHERE "token" = 'LINK';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'uniswap' WHERE "token" = 'UNI';
--> statement-breakpoint
UPDATE "payment_methods" SET "oracle_asset_id" = 'aerodrome-finance' WHERE "token" = 'AERO';
