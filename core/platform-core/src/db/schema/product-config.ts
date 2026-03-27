import { boolean, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { products } from "./products.js";

export const fleetLifecycleEnum = pgEnum("fleet_lifecycle", ["managed", "ephemeral"]);
export const fleetBillingModelEnum = pgEnum("fleet_billing_model", ["monthly", "per_use", "none"]);

export const productFeatures = pgTable("product_features", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  chatEnabled: boolean("chat_enabled").notNull().default(true),
  onboardingEnabled: boolean("onboarding_enabled").notNull().default(true),
  onboardingDefaultModel: text("onboarding_default_model"),
  onboardingSystemPrompt: text("onboarding_system_prompt"),
  onboardingMaxCredits: integer("onboarding_max_credits").notNull().default(100),
  onboardingWelcomeMsg: text("onboarding_welcome_msg"),
  sharedModuleBilling: boolean("shared_module_billing").notNull().default(true),
  sharedModuleMonitoring: boolean("shared_module_monitoring").notNull().default(true),
  sharedModuleAnalytics: boolean("shared_module_analytics").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productFleetConfig = pgTable("product_fleet_config", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  containerImage: text("container_image").notNull(),
  containerPort: integer("container_port").notNull().default(3100),
  lifecycle: fleetLifecycleEnum("lifecycle").notNull().default("managed"),
  billingModel: fleetBillingModelEnum("billing_model").notNull().default("monthly"),
  maxInstances: integer("max_instances").notNull().default(5),
  imageAllowlist: text("image_allowlist").array(),
  dockerNetwork: text("docker_network").notNull().default(""),
  placementStrategy: text("placement_strategy").notNull().default("least-loaded"),
  fleetDataDir: text("fleet_data_dir").notNull().default("/data/fleet"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productBillingConfig = pgTable("product_billing_config", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  stripePublishableKey: text("stripe_publishable_key"),
  /** Encrypted via credential vault (CRYPTO_SERVICE_KEY) before storage. */
  stripeSecretKey: text("stripe_secret_key"),
  /** Encrypted via credential vault (CRYPTO_SERVICE_KEY) before storage. */
  stripeWebhookSecret: text("stripe_webhook_secret"),
  creditPrices: jsonb("credit_prices").notNull().default({}),
  affiliateBaseUrl: text("affiliate_base_url"),
  affiliateMatchRate: numeric("affiliate_match_rate").notNull().default("1.0"),
  affiliateMaxCap: integer("affiliate_max_cap").notNull().default(20000),
  dividendRate: numeric("dividend_rate").notNull().default("1.0"),
  marginConfig: jsonb("margin_config"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
