import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    brandName: text("brand_name").notNull(),
    productName: text("product_name").notNull(),
    tagline: text("tagline").notNull().default(""),
    domain: text("domain").notNull(),
    appDomain: text("app_domain").notNull(),
    cookieDomain: text("cookie_domain").notNull(),
    companyLegal: text("company_legal").notNull().default(""),
    priceLabel: text("price_label").notNull().default(""),
    defaultImage: text("default_image").notNull().default(""),
    emailSupport: text("email_support").notNull().default(""),
    emailPrivacy: text("email_privacy").notNull().default(""),
    emailLegal: text("email_legal").notNull().default(""),
    fromEmail: text("from_email").notNull().default(""),
    homePath: text("home_path").notNull().default("/marketplace"),
    storagePrefix: text("storage_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("products_slug_idx").on(t.slug)],
);

export const productNavItems = pgTable(
  "product_nav_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    href: text("href").notNull(),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull(),
    requiresRole: text("requires_role"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_nav_items_product_sort_idx").on(t.productId, t.sortOrder)],
);

export const productDomains = pgTable(
  "product_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    host: text("host").notNull(),
    role: text("role").notNull().default("canonical"),
  },
  (t) => [uniqueIndex("product_domains_product_host_idx").on(t.productId, t.host)],
);
