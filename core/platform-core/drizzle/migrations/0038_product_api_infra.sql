-- Add api_service and api_port columns to products table
ALTER TABLE "products" ADD COLUMN "api_service" text NOT NULL DEFAULT 'core';
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "api_port" integer NOT NULL DEFAULT 3001;
