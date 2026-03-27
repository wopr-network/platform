-- Product configuration tables.
-- Moves ~46 product-configurable env vars into DB.
-- See docs/specs/2026-03-23-product-config-db-migration.md

-- Enums
CREATE TYPE "fleet_lifecycle" AS ENUM ('managed', 'ephemeral');
--> statement-breakpoint
CREATE TYPE "fleet_billing_model" AS ENUM ('monthly', 'per_use', 'none');
--> statement-breakpoint

-- Products (anchor table)
CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "brand_name" text NOT NULL,
  "product_name" text NOT NULL,
  "tagline" text NOT NULL DEFAULT '',
  "domain" text NOT NULL,
  "app_domain" text NOT NULL,
  "cookie_domain" text NOT NULL,
  "company_legal" text NOT NULL DEFAULT '',
  "price_label" text NOT NULL DEFAULT '',
  "default_image" text NOT NULL DEFAULT '',
  "email_support" text NOT NULL DEFAULT '',
  "email_privacy" text NOT NULL DEFAULT '',
  "email_legal" text NOT NULL DEFAULT '',
  "from_email" text NOT NULL DEFAULT '',
  "home_path" text NOT NULL DEFAULT '/marketplace',
  "storage_prefix" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_slug_idx" ON "products" ("slug");
--> statement-breakpoint

-- Product navigation items
CREATE TABLE IF NOT EXISTS "product_nav_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "href" text NOT NULL,
  "icon" text,
  "sort_order" integer NOT NULL,
  "requires_role" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_nav_items_product_sort_idx" ON "product_nav_items" ("product_id", "sort_order");
--> statement-breakpoint

-- Product domains (multi-domain support)
CREATE TABLE IF NOT EXISTS "product_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "host" text NOT NULL,
  "role" text NOT NULL DEFAULT 'canonical'
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_domains_product_host_idx" ON "product_domains" ("product_id", "host");
--> statement-breakpoint

-- Product feature flags
CREATE TABLE IF NOT EXISTS "product_features" (
  "product_id" uuid PRIMARY KEY REFERENCES "products"("id") ON DELETE CASCADE,
  "chat_enabled" boolean NOT NULL DEFAULT true,
  "onboarding_enabled" boolean NOT NULL DEFAULT true,
  "onboarding_default_model" text,
  "onboarding_system_prompt" text,
  "onboarding_max_credits" integer NOT NULL DEFAULT 100,
  "onboarding_welcome_msg" text,
  "shared_module_billing" boolean NOT NULL DEFAULT true,
  "shared_module_monitoring" boolean NOT NULL DEFAULT true,
  "shared_module_analytics" boolean NOT NULL DEFAULT true,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Product fleet configuration
CREATE TABLE IF NOT EXISTS "product_fleet_config" (
  "product_id" uuid PRIMARY KEY REFERENCES "products"("id") ON DELETE CASCADE,
  "container_image" text NOT NULL,
  "container_port" integer NOT NULL DEFAULT 3100,
  "lifecycle" "fleet_lifecycle" NOT NULL DEFAULT 'managed',
  "billing_model" "fleet_billing_model" NOT NULL DEFAULT 'monthly',
  "max_instances" integer NOT NULL DEFAULT 5,
  "image_allowlist" text[],
  "docker_network" text NOT NULL DEFAULT '',
  "placement_strategy" text NOT NULL DEFAULT 'least-loaded',
  "fleet_data_dir" text NOT NULL DEFAULT '/data/fleet',
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Product billing configuration
CREATE TABLE IF NOT EXISTS "product_billing_config" (
  "product_id" uuid PRIMARY KEY REFERENCES "products"("id") ON DELETE CASCADE,
  "stripe_publishable_key" text,
  "stripe_secret_key" text,
  "stripe_webhook_secret" text,
  "credit_prices" jsonb NOT NULL DEFAULT '{}',
  "affiliate_base_url" text,
  "affiliate_match_rate" numeric NOT NULL DEFAULT 1.0,
  "affiliate_max_cap" integer NOT NULL DEFAULT 20000,
  "dividend_rate" numeric NOT NULL DEFAULT 1.0,
  "margin_config" jsonb,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
