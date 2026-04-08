import { sql } from "drizzle-orm";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Bot instances table — tracks billing lifecycle for each bot.
 *
 * Billing states: created -> active -> suspended -> destroyed
 * Reactivation: suspended -> active (when credits purchased)
 */
export const botInstances = pgTable(
  "bot_instances",
  {
    /** Bot UUID. */
    id: text("id").primaryKey(),
    /** Owning tenant */
    tenantId: text("tenant_id").notNull(),
    /**
     * Product slug this instance belongs to. Resolves the container image,
     * port, network, and provision flow from `productConfigService` at the
     * moment they're needed (instead of carrying a stale spec on the row).
     */
    productSlug: text("product_slug").notNull(),
    /** Bot display name */
    name: text("name").notNull(),
    /** Node where this bot is deployed (for recovery tracking) */
    nodeId: text("node_id"),
    /** Port the container listens on (from product_fleet_config at creation time) */
    containerPort: integer("container_port").notNull().default(3100),
    /**
     * Billing lifecycle state:
     * - 'active': running, consuming credits daily
     * - 'suspended': stopped, data preserved, no credit consumption
     * - 'destroyed': container + data deleted
     */
    billingState: text("billing_state").notNull().default("active"),
    /** ISO timestamp when bot was suspended; NULL when active */
    suspendedAt: text("suspended_at"),
    /** ISO timestamp for auto-destruction (suspendedAt + 30 days); NULL when active */
    destroyAfter: text("destroy_after"),
    /** Resource tier: standard | pro | power | beast */
    resourceTier: text("resource_tier").notNull().default("standard"),
    /** Storage tier: standard | plus | pro | max */
    storageTier: text("storage_tier").notNull().default("standard"),
    /** ISO timestamp of record creation */
    createdAt: text("created_at").notNull().default(sql`(now())`),
    /** ISO timestamp of last update */
    updatedAt: text("updated_at").notNull().default(sql`(now())`),
    /** User who created this bot instance (null for legacy bots) */
    createdByUserId: text("created_by_user_id"),
  },
  (table) => [
    index("idx_bot_instances_tenant").on(table.tenantId),
    index("idx_bot_instances_product").on(table.productSlug),
    index("idx_bot_instances_billing_state").on(table.billingState),
    index("idx_bot_instances_destroy_after").on(table.destroyAfter),
    index("idx_bot_instances_node").on(table.nodeId),
  ],
);
