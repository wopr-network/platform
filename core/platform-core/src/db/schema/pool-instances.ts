import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const poolInstances = pgTable(
  "pool_instances",
  {
    id: text("id").primaryKey(),
    containerId: text("container_id").notNull(),
    status: text("status").notNull().default("warm"),
    tenantId: text("tenant_id"),
    name: text("name"),
    productSlug: text("product_slug"),
    image: text("image"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    claimedAt: timestamp("claimed_at"),
  },
  (table) => [
    index("pool_instances_slug_status_created").on(table.productSlug, table.status, table.createdAt),
    index("pool_instances_status_created").on(table.status, table.createdAt),
  ],
);
