-- Add UI infrastructure columns to products table.
-- These are read by the proxy manager to route traffic to the correct UI container.
ALTER TABLE "products" ADD COLUMN "ui_service" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ui_port" integer NOT NULL DEFAULT 3000;
