-- Add instance_id and product_slug to meter_events for per-instance billing
ALTER TABLE "meter_events" ADD COLUMN "instance_id" text;
--> statement-breakpoint
ALTER TABLE "meter_events" ADD COLUMN "product_slug" text;
--> statement-breakpoint
CREATE INDEX "idx_meter_instance" ON "meter_events" ("instance_id");
--> statement-breakpoint
CREATE INDEX "idx_meter_product" ON "meter_events" ("product_slug");
--> statement-breakpoint

-- Add instance_id and product_slug to usage_summaries for aggregated per-instance display
ALTER TABLE "usage_summaries" ADD COLUMN "instance_id" text;
--> statement-breakpoint
ALTER TABLE "usage_summaries" ADD COLUMN "product_slug" text;
--> statement-breakpoint

-- Add product_slug to gateway_service_keys for product-aware billing
ALTER TABLE "gateway_service_keys" ADD COLUMN "product_slug" text;
