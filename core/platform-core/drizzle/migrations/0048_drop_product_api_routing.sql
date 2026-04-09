-- Drop per-product API routing columns. All products' API traffic routes to
-- core (BetterAuth, tRPC, webhooks all live there); per-product overrides
-- were only ever used by one product (holyship), set incorrectly, and broke
-- OAuth login because auth traffic bypassed BetterAuth.
ALTER TABLE "products" DROP COLUMN IF EXISTS "api_service";
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN IF EXISTS "api_port";
