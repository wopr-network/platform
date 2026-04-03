ALTER TABLE "product_features" ADD COLUMN IF NOT EXISTS "floor_input_rate_per_1k" numeric NOT NULL DEFAULT '0.00005';
--> statement-breakpoint
ALTER TABLE "product_features" ADD COLUMN IF NOT EXISTS "floor_output_rate_per_1k" numeric NOT NULL DEFAULT '0.0002';
