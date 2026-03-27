import { bigint, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Per-tenant update configuration — controls whether a tenant's bots
 * are updated automatically or require manual intervention.
 */
export const tenantUpdateConfigs = pgTable("tenant_update_configs", {
  /** Owning tenant (one config per tenant) */
  tenantId: text("tenant_id").primaryKey(),
  /** Update mode: 'auto' for automatic updates, 'manual' for opt-in */
  mode: text("mode").notNull().default("manual"),
  /** Preferred hour (0-23 UTC) for automatic updates */
  preferredHourUtc: integer("preferred_hour_utc").notNull().default(3),
  /** Epoch ms of last config change */
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});
