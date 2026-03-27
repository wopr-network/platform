import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const poolInstances = pgTable("pool_instances", {
  id: text("id").primaryKey(),
  containerId: text("container_id").notNull(),
  status: text("status").notNull().default("warm"),
  tenantId: text("tenant_id"),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  claimedAt: timestamp("claimed_at"),
});
