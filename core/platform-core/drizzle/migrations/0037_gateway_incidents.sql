CREATE TABLE IF NOT EXISTS "gateway_incidents" (
  "id" text PRIMARY KEY NOT NULL,
  "timestamp" bigint NOT NULL,
  "tenant_id" text NOT NULL,
  "capability" text NOT NULL,
  "provider" text NOT NULL,
  "model" text,
  "error_code" text NOT NULL,
  "upstream_status" integer,
  "upstream_body" text,
  "request_duration_ms" integer,
  "models_attempted" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gi_timestamp" ON "gateway_incidents" ("timestamp");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gi_tenant" ON "gateway_incidents" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gi_error_code" ON "gateway_incidents" ("error_code");
