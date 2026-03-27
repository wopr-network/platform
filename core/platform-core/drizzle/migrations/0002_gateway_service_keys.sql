CREATE TABLE IF NOT EXISTS "gateway_service_keys" (
  "id" text PRIMARY KEY NOT NULL,
  "key_hash" text NOT NULL,
  "tenant_id" text NOT NULL,
  "instance_id" text NOT NULL,
  "created_at" bigint NOT NULL,
  "revoked_at" bigint
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_gateway_service_keys_hash" ON "gateway_service_keys" USING btree ("key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gateway_service_keys_tenant" ON "gateway_service_keys" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_gateway_service_keys_instance" ON "gateway_service_keys" USING btree ("instance_id");
