import { boolean, index, pgTable, serial, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { products } from "./products.js";

/** Per-product OAuth provider config. Client IDs only — secrets stay in Vault. */
export const productAuthConfig = pgTable(
  "product_auth_config",
  {
    id: serial("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** OAuth provider name: "github", "google", "discord", etc. */
    provider: text("provider").notNull(),
    /** Public client ID (used in browser OAuth redirects). */
    clientId: text("client_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.productId, t.provider), index("product_auth_config_product").on(t.productId)],
);
