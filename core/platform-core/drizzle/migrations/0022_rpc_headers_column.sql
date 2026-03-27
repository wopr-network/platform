ALTER TABLE "payment_methods" ADD COLUMN IF NOT EXISTS "rpc_headers" text NOT NULL DEFAULT '{}';
