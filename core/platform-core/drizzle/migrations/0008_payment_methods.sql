CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "token" text NOT NULL,
  "chain" text NOT NULL,
  "contract_address" text,
  "decimals" integer NOT NULL,
  "display_name" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "display_order" integer NOT NULL DEFAULT 0,
  "rpc_url" text,
  "confirmations" integer NOT NULL DEFAULT 1,
  "created_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
INSERT INTO "payment_methods" ("id", "type", "token", "chain", "contract_address", "decimals", "display_name", "display_order", "confirmations") VALUES
  ('USDC:base', 'erc20', 'USDC', 'base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 6, 'USDC on Base', 0, 1),
  ('USDT:base', 'erc20', 'USDT', 'base', '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', 6, 'USDT on Base', 1, 1),
  ('DAI:base', 'erc20', 'DAI', 'base', '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', 18, 'DAI on Base', 2, 1),
  ('ETH:base', 'native', 'ETH', 'base', NULL, 18, 'ETH on Base', 3, 1),
  ('BTC:mainnet', 'native', 'BTC', 'bitcoin', NULL, 8, 'Bitcoin', 10, 3)
ON CONFLICT ("id") DO NOTHING;
