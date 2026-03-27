-- Hot pool: pre-provisioned warm containers for instant claiming
CREATE TABLE IF NOT EXISTS "pool_config" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "pool_size" integer NOT NULL DEFAULT 2
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "pool_instances" (
  "id" text PRIMARY KEY,
  "container_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'warm',
  "tenant_id" text,
  "name" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "claimed_at" timestamp
);
--> statement-breakpoint

-- Claim query: WHERE status = 'warm' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED
CREATE INDEX IF NOT EXISTS "pool_instances_status_created" ON "pool_instances" ("status", "created_at");
--> statement-breakpoint

-- Tenant lookup for admin queries
CREATE INDEX IF NOT EXISTS "pool_instances_tenant" ON "pool_instances" ("tenant_id") WHERE "tenant_id" IS NOT NULL;
--> statement-breakpoint

-- Seed default pool config
INSERT INTO "pool_config" ("id", "pool_size") VALUES (1, 2)
  ON CONFLICT ("id") DO NOTHING;
