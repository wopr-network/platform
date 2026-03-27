CREATE TABLE IF NOT EXISTS "tenant_update_configs" (
  "tenant_id" text PRIMARY KEY NOT NULL,
  "mode" text DEFAULT 'manual' NOT NULL,
  "preferred_hour_utc" integer DEFAULT 3 NOT NULL,
  "updated_at" bigint NOT NULL
);
