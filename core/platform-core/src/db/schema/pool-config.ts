import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const poolConfig = pgTable(
  "pool_config",
  {
    id: integer("id").primaryKey().default(1),
    poolSize: integer("pool_size").notNull().default(2),
    productSlug: text("product_slug"),
  },
  (table) => [uniqueIndex("pool_config_product_slug_unique").on(table.productSlug)],
);
