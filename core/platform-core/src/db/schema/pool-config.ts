import { integer, pgTable } from "drizzle-orm/pg-core";

export const poolConfig = pgTable("pool_config", {
  id: integer("id").primaryKey().default(1),
  poolSize: integer("pool_size").notNull().default(2),
});
