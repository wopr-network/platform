# Product Config DB Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ~46 product-configurable environment variables into database tables, served via tRPC, managed via admin UI.

**Architecture:** New Drizzle schema tables in platform-core, product config repository with in-memory cache, tRPC router (public + admin), admin UI pages in platform-ui-core. Existing modules migrate one at a time from `process.env` reads to `getProductConfig()` calls.

**Tech Stack:** Drizzle ORM, tRPC, Zod, PGlite (tests), Next.js App Router, shadcn/ui, Biome

**Spec:** `docs/specs/2026-03-23-product-config-db-migration.md`

---

## Design Principle: Eliminate Code in Products

**The goal is NOT just swapping env vars for DB reads.** The goal is that platform-core does the heavy lifting so product backends shrink dramatically.

Before: each product backend has its own `config.ts` (30+ env vars), CORS setup, email config, fleet wiring.
After: each product backend passes `PRODUCT_SLUG` to `platformBoot()` and platform-core auto-configures everything from DB.

```typescript
// paperclip-platform/src/index.ts — AFTER (the dream)
import { platformBoot } from "@wopr-network/platform-core";

const app = await platformBoot({
  slug: "paperclip",
  db: getDb(),
  // product-specific route additions only:
  extraRoutes: (hono) => {
    // any paperclip-only routes
  },
});
```

## File Map

### platform-core (new files)

| File | Responsibility |
|------|---------------|
| `src/db/schema/products.ts` | Drizzle schema: products, product_nav_items, product_domains |
| `src/db/schema/product-config.ts` | Drizzle schema: product_features, product_fleet_config, product_billing_config |
| `src/product-config/repository-types.ts` | Plain TS interfaces: `IProductConfigRepository`, domain objects (no Drizzle types) |
| `src/product-config/drizzle-product-config-repository.ts` | Drizzle implementation of `IProductConfigRepository` |
| `src/product-config/drizzle-product-config-repository.test.ts` | Repository tests (PGlite) |
| `src/product-config/cache.ts` | In-memory cache with TTL + invalidation |
| `src/product-config/cache.test.ts` | Cache tests |
| `src/product-config/index.ts` | Public API: `getProductConfig()`, `getProductBrand()`, `deriveCorsOrigins()` |
| `src/trpc/product-config-router.ts` | tRPC router: public + admin endpoints |
| `src/trpc/product-config-router.test.ts` | Router tests |
| `scripts/seed-products.ts` | One-time seed script to populate tables from current env vars |

### platform-core (modified files)

| File | Change |
|------|--------|
| `src/db/schema/index.ts` | Export new schema tables |
| `src/trpc/index.ts` | Export product config router |
| `drizzle/migrations/XXXX_*.sql` | Generated migration |

### platform-ui-core (new files)

| File | Responsibility |
|------|---------------|
| `src/app/admin/products/page.tsx` | Admin product config page (tabs per domain) |
| `src/app/admin/products/loading.tsx` | Loading skeleton |
| `src/app/admin/products/error.tsx` | Error boundary |
| `src/components/admin/products/brand-form.tsx` | Brand identity form |
| `src/components/admin/products/nav-editor.tsx` | Navigation item editor (reorder, toggle, add/remove) |
| `src/components/admin/products/features-form.tsx` | Feature flags form |
| `src/components/admin/products/fleet-form.tsx` | Fleet config form |
| `src/components/admin/products/billing-form.tsx` | Billing config form |

### platform-ui-core (modified files)

| File | Change |
|------|--------|
| `src/lib/brand-config.ts` | Add `initBrandConfig()` that fetches from tRPC |
| `src/components/sidebar.tsx` | Read nav items from brand config (already does, but confirm) |

---

## Phase 1: Schema + Repository

### Task 1: Product Schema Tables

**Files:**
- Create: `src/db/schema/products.ts`
- Create: `src/db/schema/product-config.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Write products schema**

```typescript
// src/db/schema/products.ts
import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
  (t) => [unique("products_slug_uniq").on(t.slug)],
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
    sortOrder: uuid("sort_order").notNull().$type<number>(),
    requiresRole: text("requires_role"),
    enabled: text("enabled").notNull().default("true").$type<"true" | "false">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_product_nav_items_product").on(t.productId, t.sortOrder)],
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
  (t) => [unique("product_domains_product_host_uniq").on(t.productId, t.host)],
);
```

- [ ] **Step 2: Write product config schema**

```typescript
// src/db/schema/product-config.ts
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
  stripeSecretKey: text("stripe_secret_key"),
  stripeWebhookSecret: text("stripe_webhook_secret"),
  creditPrices: jsonb("credit_prices").notNull().default({}),
  affiliateBaseUrl: text("affiliate_base_url"),
  affiliateMatchRate: numeric("affiliate_match_rate").notNull().default("1.0"),
  affiliateMaxCap: integer("affiliate_max_cap").notNull().default(20000),
  dividendRate: numeric("dividend_rate").notNull().default("1.0"),
  marginConfig: jsonb("margin_config"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Export from schema index**

Add to `src/db/schema/index.ts`:

```typescript
export * from "./products.js";
export * from "./product-config.js";
```

- [ ] **Step 4: Generate migration**

Run: `npx drizzle-kit generate`
Expected: New migration file in `drizzle/migrations/`

- [ ] **Step 5: Verify migration applies**

Run: `npx vitest run src/product-config/repository.test.ts` (will create in next task — for now just verify the schema compiles)
Run: `npm run check`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/products.ts src/db/schema/product-config.ts src/db/schema/index.ts drizzle/migrations/
git commit -m "feat: add product config Drizzle schema tables"
```

---

### Task 2: Repository Types (IProductConfigRepository)

**Files:**
- Create: `src/product-config/repository-types.ts`

- [ ] **Step 1: Write plain TS interfaces (no Drizzle types)**

Following the `fleet/repository-types.ts` pattern: plain domain objects + repository interface.

```typescript
// src/product-config/repository-types.ts
//
// Plain TypeScript interfaces for product configuration domain.
// No Drizzle types. These are the contract all consumers work against.

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

/** Plain domain object representing a product — mirrors `products` table. */
export interface Product {
  id: string;
  slug: string;
  brandName: string;
  productName: string;
  tagline: string;
  domain: string;
  appDomain: string;
  cookieDomain: string;
  companyLegal: string;
  priceLabel: string;
  defaultImage: string;
  emailSupport: string;
  emailPrivacy: string;
  emailLegal: string;
  fromEmail: string;
  homePath: string;
  storagePrefix: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// ProductNavItem
// ---------------------------------------------------------------------------

export interface ProductNavItem {
  id: string;
  productId: string;
  label: string;
  href: string;
  icon: string | null;
  sortOrder: number;
  requiresRole: string | null;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// ProductDomain
// ---------------------------------------------------------------------------

export interface ProductDomain {
  id: string;
  productId: string;
  host: string;
  role: "canonical" | "redirect";
}

// ---------------------------------------------------------------------------
// ProductFeatures
// ---------------------------------------------------------------------------

export interface ProductFeatures {
  productId: string;
  chatEnabled: boolean;
  onboardingEnabled: boolean;
  onboardingDefaultModel: string | null;
  onboardingSystemPrompt: string | null;
  onboardingMaxCredits: number;
  onboardingWelcomeMsg: string | null;
  sharedModuleBilling: boolean;
  sharedModuleMonitoring: boolean;
  sharedModuleAnalytics: boolean;
}

// ---------------------------------------------------------------------------
// ProductFleetConfig
// ---------------------------------------------------------------------------

export type FleetLifecycle = "managed" | "ephemeral";
export type FleetBillingModel = "monthly" | "per_use" | "none";

export interface ProductFleetConfig {
  productId: string;
  containerImage: string;
  containerPort: number;
  lifecycle: FleetLifecycle;
  billingModel: FleetBillingModel;
  maxInstances: number;
  imageAllowlist: string[] | null;
  dockerNetwork: string;
  placementStrategy: string;
  fleetDataDir: string;
}

// ---------------------------------------------------------------------------
// ProductBillingConfig
// ---------------------------------------------------------------------------

export interface ProductBillingConfig {
  productId: string;
  stripePublishableKey: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  creditPrices: Record<string, number>;
  affiliateBaseUrl: string | null;
  affiliateMatchRate: number;
  affiliateMaxCap: number;
  dividendRate: number;
  marginConfig: unknown;
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/** Full product config resolved from all tables. */
export interface ProductConfig {
  product: Product;
  navItems: ProductNavItem[];
  domains: ProductDomain[];
  features: ProductFeatures | null;
  fleet: ProductFleetConfig | null;
  billing: ProductBillingConfig | null;
}

/** Brand config shape served to UI (matches BrandConfig in platform-ui-core). */
export interface ProductBrandConfig {
  productName: string;
  brandName: string;
  domain: string;
  appDomain: string;
  tagline: string;
  emails: { privacy: string; legal: string; support: string };
  defaultImage: string;
  storagePrefix: string;
  companyLegalName: string;
  price: string;
  homePath: string;
  chatEnabled: boolean;
  navItems: Array<{ label: string; href: string }>;
  domains?: Array<{ host: string; role: string }>;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/** Upsert payload for product brand fields. */
export type ProductBrandUpdate = Partial<Omit<Product, "id" | "slug" | "createdAt" | "updatedAt">>;

/** Upsert payload for a nav item (no id — replaced in bulk). */
export interface NavItemInput {
  label: string;
  href: string;
  icon?: string;
  sortOrder: number;
  requiresRole?: string;
  enabled?: boolean;
}

export interface IProductConfigRepository {
  getBySlug(slug: string): Promise<ProductConfig | null>;
  listAll(): Promise<ProductConfig[]>;
  upsertProduct(slug: string, data: ProductBrandUpdate): Promise<Product>;
  replaceNavItems(productId: string, items: NavItemInput[]): Promise<void>;
  upsertFeatures(productId: string, data: Partial<ProductFeatures>): Promise<void>;
  upsertFleetConfig(productId: string, data: Partial<ProductFleetConfig>): Promise<void>;
  upsertBillingConfig(productId: string, data: Partial<ProductBillingConfig>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive CORS origins from product config. */
export function deriveCorsOrigins(product: Product, domains: ProductDomain[]): string[] {
  const origins = new Set<string>();
  origins.add(`https://${product.domain}`);
  origins.add(`https://${product.appDomain}`);
  for (const d of domains) {
    origins.add(`https://${d.host}`);
  }
  return [...origins];
}

/** Derive brand config for UI from full product config. */
export function toBrandConfig(config: ProductConfig): ProductBrandConfig {
  const { product, navItems, domains, features } = config;
  return {
    productName: product.productName,
    brandName: product.brandName,
    domain: product.domain,
    appDomain: product.appDomain,
    tagline: product.tagline,
    emails: {
      privacy: product.emailPrivacy,
      legal: product.emailLegal,
      support: product.emailSupport,
    },
    defaultImage: product.defaultImage,
    storagePrefix: product.storagePrefix,
    companyLegalName: product.companyLegal,
    price: product.priceLabel,
    homePath: product.homePath,
    chatEnabled: features?.chatEnabled ?? true,
    navItems: navItems
      .filter((n) => n.enabled)
      .map((n) => ({ label: n.label, href: n.href })),
    domains: domains.length > 0 ? domains.map((d) => ({ host: d.host, role: d.role })) : undefined,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/product-config/repository-types.ts
git commit -m "feat: add product config repository types (IProductConfigRepository)"
```

---

### Task 3: Drizzle Product Config Repository

**Files:**
- Create: `src/product-config/drizzle-product-config-repository.ts`
- Create: `src/product-config/drizzle-product-config-repository.test.ts`

- [ ] **Step 1: Write failing test — getBySlug**

```typescript
// src/product-config/drizzle-product-config-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb } from "../test/db.js";
import { DrizzleProductConfigRepository } from "./drizzle-product-config-repository.js";
import { products } from "../db/schema/products.js";
import type { DrizzleDb } from "../db/index.js";

describe("DrizzleProductConfigRepository", () => {
  let db: DrizzleDb;
  let pool: PGlite;
  let repo: ProductConfigRepository;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db;
    pool = result.pool;
    repo = new DrizzleProductConfigRepository(db);
  });

  afterAll(async () => {
    await pool.close();
  });

  it("returns null for unknown slug", async () => {
    const result = await repo.getBySlug("nonexistent");
    expect(result).toBeNull();
  });

  it("returns full config for seeded product", async () => {
    // Seed a product
    const [inserted] = await db
      .insert(products)
      .values({
        slug: "test-product",
        brandName: "Test",
        productName: "Test Product",
        domain: "test.com",
        appDomain: "app.test.com",
        cookieDomain: ".test.com",
        storagePrefix: "test",
      })
      .returning();

    const config = await repo.getBySlug("test-product");
    expect(config).not.toBeNull();
    expect(config!.product.slug).toBe("test-product");
    expect(config!.product.brandName).toBe("Test");
    expect(config!.navItems).toEqual([]);
    expect(config!.domains).toEqual([]);
    expect(config!.features).toBeNull();
    expect(config!.fleet).toBeNull();
    expect(config!.billing).toBeNull();
  });

  it("returns nav items sorted by sortOrder", async () => {
    const [product] = await db
      .insert(products)
      .values({
        slug: "nav-test",
        brandName: "Nav",
        productName: "Nav Test",
        domain: "nav.com",
        appDomain: "app.nav.com",
        cookieDomain: ".nav.com",
        storagePrefix: "nav",
      })
      .returning();

    const { productNavItems } = await import("../db/schema/products.js");
    await db.insert(productNavItems).values([
      { productId: product.id, label: "Second", href: "/second", sortOrder: 2 },
      { productId: product.id, label: "First", href: "/first", sortOrder: 1 },
    ]);

    const config = await repo.getBySlug("nav-test");
    expect(config!.navItems).toHaveLength(2);
    expect(config!.navItems[0].label).toBe("First");
    expect(config!.navItems[1].label).toBe("Second");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/product-config/repository.test.ts`
Expected: FAIL — module `./repository.js` not found

- [ ] **Step 3: Write Drizzle repository implementation**

```typescript
// src/product-config/drizzle-product-config-repository.ts
import { eq, asc } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { products, productNavItems, productDomains } from "../db/schema/products.js";
import {
  productFeatures,
  productFleetConfig,
  productBillingConfig,
} from "../db/schema/product-config.js";
import type { IProductConfigRepository, ProductConfig, ProductBrandUpdate, NavItemInput } from "./repository-types.js";

export class DrizzleProductConfigRepository implements IProductConfigRepository {
  constructor(private db: DrizzleDb) {}

  async getBySlug(slug: string): Promise<ProductConfig | null> {
    const [product] = await this.db
      .select()
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);

    if (!product) return null;

    const [navItems, domains, features, fleet, billing] = await Promise.all([
      this.db
        .select()
        .from(productNavItems)
        .where(eq(productNavItems.productId, product.id))
        .orderBy(asc(productNavItems.sortOrder)),
      this.db
        .select()
        .from(productDomains)
        .where(eq(productDomains.productId, product.id)),
      this.db
        .select()
        .from(productFeatures)
        .where(eq(productFeatures.productId, product.id))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      this.db
        .select()
        .from(productFleetConfig)
        .where(eq(productFleetConfig.productId, product.id))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      this.db
        .select()
        .from(productBillingConfig)
        .where(eq(productBillingConfig.productId, product.id))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    return { product, navItems, domains, features, fleet, billing };
  }

  async listAll(): Promise<ProductConfig[]> {
    const allProducts = await this.db.select().from(products);
    return Promise.all(allProducts.map((p) => this.getBySlug(p.slug).then((c) => c!)));
  }

  async upsertProduct(
    slug: string,
    data: Partial<typeof products.$inferInsert>,
  ): Promise<typeof products.$inferSelect> {
    const [result] = await this.db
      .insert(products)
      .values({ slug, ...data } as typeof products.$inferInsert)
      .onConflictDoUpdate({
        target: products.slug,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return result;
  }

  async replaceNavItems(
    productId: string,
    items: Array<{ label: string; href: string; icon?: string; sortOrder: number; requiresRole?: string; enabled?: boolean }>,
  ): Promise<void> {
    await this.db.delete(productNavItems).where(eq(productNavItems.productId, productId));
    if (items.length > 0) {
      await this.db.insert(productNavItems).values(
        items.map((item) => ({
          productId,
          label: item.label,
          href: item.href,
          icon: item.icon ?? null,
          sortOrder: item.sortOrder,
          requiresRole: item.requiresRole ?? null,
          enabled: item.enabled === false ? "false" : "true",
        })),
      );
    }
  }

  async upsertFeatures(
    productId: string,
    data: Partial<typeof productFeatures.$inferInsert>,
  ): Promise<void> {
    await this.db
      .insert(productFeatures)
      .values({ productId, ...data } as typeof productFeatures.$inferInsert)
      .onConflictDoUpdate({
        target: productFeatures.productId,
        set: { ...data, updatedAt: new Date() },
      });
  }

  async upsertFleetConfig(
    productId: string,
    data: Partial<typeof productFleetConfig.$inferInsert>,
  ): Promise<void> {
    await this.db
      .insert(productFleetConfig)
      .values({ productId, ...data } as typeof productFleetConfig.$inferInsert)
      .onConflictDoUpdate({
        target: productFleetConfig.productId,
        set: { ...data, updatedAt: new Date() },
      });
  }

  async upsertBillingConfig(
    productId: string,
    data: Partial<typeof productBillingConfig.$inferInsert>,
  ): Promise<void> {
    await this.db
      .insert(productBillingConfig)
      .values({ productId, ...data } as typeof productBillingConfig.$inferInsert)
      .onConflictDoUpdate({
        target: productBillingConfig.productId,
        set: { ...data, updatedAt: new Date() },
      });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/product-config/repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/product-config/
git commit -m "feat: add product config repository with tests"
```

---

### Task 4: In-Memory Cache

**Files:**
- Create: `src/product-config/cache.ts`
- Create: `src/product-config/cache.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/product-config/cache.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductConfigCache } from "./cache.js";
import type { ProductConfig } from "./types.js";

const mockConfig: ProductConfig = {
  product: {
    id: "test-id",
    slug: "test",
    brandName: "Test",
    productName: "Test",
    tagline: "",
    domain: "test.com",
    appDomain: "app.test.com",
    cookieDomain: ".test.com",
    companyLegal: "",
    priceLabel: "",
    defaultImage: "",
    emailSupport: "",
    emailPrivacy: "",
    emailLegal: "",
    fromEmail: "",
    homePath: "/dashboard",
    storagePrefix: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  navItems: [],
  domains: [],
  features: null,
  fleet: null,
  billing: null,
};

describe("ProductConfigCache", () => {
  let fetcher: ReturnType<typeof vi.fn>;
  let cache: ProductConfigCache;

  beforeEach(() => {
    fetcher = vi.fn().mockResolvedValue(mockConfig);
    cache = new ProductConfigCache(fetcher, { ttlMs: 100 });
  });

  it("calls fetcher on first get", async () => {
    const result = await cache.get("test");
    expect(result).toEqual(mockConfig);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns cached value on second get", async () => {
    await cache.get("test");
    await cache.get("test");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("refetches after TTL expires", async () => {
    await cache.get("test");
    await new Promise((r) => setTimeout(r, 150));
    await cache.get("test");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidate forces refetch", async () => {
    await cache.get("test");
    cache.invalidate("test");
    await cache.get("test");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/product-config/cache.test.ts`
Expected: FAIL

- [ ] **Step 3: Write cache implementation**

```typescript
// src/product-config/cache.ts
import type { ProductConfig } from "./types.js";

interface CacheEntry {
  config: ProductConfig;
  expiresAt: number;
}

export class ProductConfigCache {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;
  private fetcher: (slug: string) => Promise<ProductConfig | null>;

  constructor(
    fetcher: (slug: string) => Promise<ProductConfig | null>,
    opts: { ttlMs?: number } = {},
  ) {
    this.fetcher = fetcher;
    this.ttlMs = opts.ttlMs ?? 60_000;
  }

  async get(slug: string): Promise<ProductConfig | null> {
    const entry = this.cache.get(slug);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.config;
    }
    const config = await this.fetcher(slug);
    if (config) {
      this.cache.set(slug, { config, expiresAt: Date.now() + this.ttlMs });
    }
    return config;
  }

  invalidate(slug: string): void {
    this.cache.delete(slug);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/product-config/cache.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/product-config/cache.ts src/product-config/cache.test.ts
git commit -m "feat: add product config in-memory cache with TTL"
```

---

### Task 5: Public API (index.ts)

**Files:**
- Create: `src/product-config/index.ts`

- [ ] **Step 1: Write public API module**

```typescript
// src/product-config/index.ts
import type { DrizzleDb } from "../db/index.js";
import { ProductConfigCache } from "./cache.js";
import { DrizzleProductConfigRepository } from "./drizzle-product-config-repository.js";
import type { IProductConfigRepository, ProductBrandConfig, ProductConfig } from "./repository-types.js";
import { deriveCorsOrigins, toBrandConfig } from "./repository-types.js";

export type { ProductConfig, ProductBrandConfig, IProductConfigRepository, ProductFeatures, ProductFleetConfig, ProductBillingConfig, FleetLifecycle, FleetBillingModel } from "./repository-types.js";
export { DrizzleProductConfigRepository } from "./drizzle-product-config-repository.js";
export { ProductConfigCache } from "./cache.js";
export { deriveCorsOrigins, toBrandConfig } from "./repository-types.js";

let _repo: IProductConfigRepository | null = null;
let _cache: ProductConfigCache | null = null;

/** Initialize the product config system. Call once at startup. */
export function initProductConfig(db: DrizzleDb): void {
  _repo = new DrizzleProductConfigRepository(db);
  _cache = new ProductConfigCache((slug) => _repo!.getBySlug(slug));
}

/** Initialize with a custom repository (for testing or alternative backends). */
export function initProductConfigWithRepo(repo: IProductConfigRepository): void {
  _repo = repo;
  _cache = new ProductConfigCache((slug) => _repo!.getBySlug(slug));
}

/** Get full product config by slug. Cached. */
export async function getProductConfig(slug: string): Promise<ProductConfig | null> {
  if (!_cache) throw new Error("Product config not initialized. Call initProductConfig() first.");
  return _cache.get(slug);
}

/** Get brand config formatted for UI consumption. */
export async function getProductBrand(slug: string): Promise<ProductBrandConfig | null> {
  const config = await getProductConfig(slug);
  if (!config) return null;
  return toBrandConfig(config);
}

/** Get the repository for admin mutations. */
export function getProductConfigRepo(): IProductConfigRepository {
  if (!_repo) throw new Error("Product config not initialized.");
  return _repo;
}

/** Invalidate cache for a product (call after admin mutations). */
export function invalidateProductConfig(slug: string): void {
  _cache?.invalidate(slug);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/product-config/index.ts
git commit -m "feat: add product config public API with cache"
```

---

## Phase 2: tRPC Router

### Task 6: Product Config tRPC Router

**Files:**
- Create: `src/trpc/product-config-router.ts`
- Modify: `src/trpc/index.ts`

- [ ] **Step 1: Write the router**

```typescript
// src/trpc/product-config-router.ts
import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "./init.js";
import type { IProductConfigRepository } from "../product-config/repository-types.js";
import type { ProductConfigCache } from "../product-config/cache.js";
import { getProductBrand } from "../product-config/index.js";

export function createProductConfigRouter(
  getRepo: () => IProductConfigRepository,
  getCache: () => ProductConfigCache,
  productSlug: string,
) {
  return router({
    // --- Public ---
    getBrandConfig: publicProcedure.query(async () => {
      return getProductBrand(productSlug);
    }),

    getNavItems: publicProcedure.query(async () => {
      const brand = await getProductBrand(productSlug);
      return brand?.navItems ?? [];
    }),

    // --- Admin ---
    admin: router({
      get: adminProcedure.query(async () => {
        return getRepo().getBySlug(productSlug);
      }),

      listAll: adminProcedure.query(async () => {
        return getRepo().listAll();
      }),

      updateBrand: adminProcedure
        .input(
          z.object({
            brandName: z.string().min(1).optional(),
            productName: z.string().min(1).optional(),
            tagline: z.string().optional(),
            domain: z.string().min(1).optional(),
            appDomain: z.string().min(1).optional(),
            cookieDomain: z.string().optional(),
            companyLegal: z.string().optional(),
            priceLabel: z.string().optional(),
            defaultImage: z.string().optional(),
            emailSupport: z.string().email().optional(),
            emailPrivacy: z.string().email().optional(),
            emailLegal: z.string().email().optional(),
            fromEmail: z.string().email().optional(),
            homePath: z.string().optional(),
            storagePrefix: z.string().min(1).optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const result = await getRepo().upsertProduct(productSlug, input);
          getCache().invalidate(productSlug);
          return result;
        }),

      updateNavItems: adminProcedure
        .input(
          z.array(
            z.object({
              label: z.string().min(1),
              href: z.string().min(1),
              icon: z.string().optional(),
              sortOrder: z.number().int().min(0),
              requiresRole: z.string().optional(),
              enabled: z.boolean().optional(),
            }),
          ),
        )
        .mutation(async ({ input }) => {
          const config = await getRepo().getBySlug(productSlug);
          if (!config) throw new Error("Product not found");
          await getRepo().replaceNavItems(config.product.id, input);
          getCache().invalidate(productSlug);
        }),

      updateFeatures: adminProcedure
        .input(
          z.object({
            chatEnabled: z.boolean().optional(),
            onboardingEnabled: z.boolean().optional(),
            onboardingDefaultModel: z.string().optional(),
            onboardingSystemPrompt: z.string().optional(),
            onboardingMaxCredits: z.number().int().min(0).optional(),
            onboardingWelcomeMsg: z.string().optional(),
            sharedModuleBilling: z.boolean().optional(),
            sharedModuleMonitoring: z.boolean().optional(),
            sharedModuleAnalytics: z.boolean().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const config = await getRepo().getBySlug(productSlug);
          if (!config) throw new Error("Product not found");
          await getRepo().upsertFeatures(config.product.id, input);
          getCache().invalidate(productSlug);
        }),

      updateFleet: adminProcedure
        .input(
          z.object({
            containerImage: z.string().optional(),
            containerPort: z.number().int().optional(),
            lifecycle: z.enum(["managed", "ephemeral"]).optional(),
            billingModel: z.enum(["monthly", "per_use", "none"]).optional(),
            maxInstances: z.number().int().min(1).optional(),
            imageAllowlist: z.array(z.string()).optional(),
            dockerNetwork: z.string().optional(),
            placementStrategy: z.string().optional(),
            fleetDataDir: z.string().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const config = await getRepo().getBySlug(productSlug);
          if (!config) throw new Error("Product not found");
          await getRepo().upsertFleetConfig(config.product.id, input);
          getCache().invalidate(productSlug);
        }),

      updateBilling: adminProcedure
        .input(
          z.object({
            stripePublishableKey: z.string().optional(),
            stripeSecretKey: z.string().optional(),
            stripeWebhookSecret: z.string().optional(),
            creditPrices: z.record(z.string(), z.number()).optional(),
            affiliateBaseUrl: z.string().url().optional(),
            affiliateMatchRate: z.number().min(0).optional(),
            affiliateMaxCap: z.number().int().min(0).optional(),
            dividendRate: z.number().min(0).optional(),
            marginConfig: z.unknown().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          const config = await getRepo().getBySlug(productSlug);
          if (!config) throw new Error("Product not found");
          await getRepo().upsertBillingConfig(config.product.id, input);
          getCache().invalidate(productSlug);
        }),
    }),
  });
}
```

- [ ] **Step 2: Export from tRPC index**

Add to `src/trpc/index.ts`:

```typescript
export { createProductConfigRouter } from "./product-config-router.js";
```

- [ ] **Step 3: Run type check**

Run: `npm run check` (in platform-core)
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/trpc/product-config-router.ts src/trpc/index.ts
git commit -m "feat: add product config tRPC router (public + admin)"
```

---

### Task 7: Seed Script

**Files:**
- Create: `scripts/seed-products.ts`

- [ ] **Step 1: Write seed script**

This script reads current env var values and populates the product tables. Run once per product deployment to migrate existing config into the database.

```typescript
// scripts/seed-products.ts
/**
 * Seed product config tables from current environment.
 *
 * Usage:
 *   PRODUCT_SLUG=paperclip npx tsx scripts/seed-products.ts
 *
 * Or seed all 4 products at once:
 *   npx tsx scripts/seed-products.ts --all
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../src/db/schema/index.js";

const PRODUCT_PRESETS: Record<string, {
  brandName: string;
  productName: string;
  tagline: string;
  domain: string;
  appDomain: string;
  cookieDomain: string;
  companyLegal: string;
  priceLabel: string;
  defaultImage: string;
  emailSupport: string;
  emailPrivacy: string;
  emailLegal: string;
  fromEmail: string;
  homePath: string;
  storagePrefix: string;
  navItems: Array<{ label: string; href: string; sortOrder: number }>;
  fleet: { containerImage: string; lifecycle: "managed" | "ephemeral"; billingModel: "monthly" | "per_use" | "none"; maxInstances: number };
}> = {
  wopr: {
    brandName: "WOPR",
    productName: "WOPR Bot",
    tagline: "A $5/month supercomputer that manages your business.",
    domain: "wopr.bot",
    appDomain: "app.wopr.bot",
    cookieDomain: ".wopr.bot",
    companyLegal: "WOPR Network Inc.",
    priceLabel: "$5/month",
    defaultImage: "ghcr.io/wopr-network/wopr:latest",
    emailSupport: "support@wopr.bot",
    emailPrivacy: "privacy@wopr.bot",
    emailLegal: "legal@wopr.bot",
    fromEmail: "noreply@wopr.bot",
    homePath: "/marketplace",
    storagePrefix: "wopr",
    navItems: [
      { label: "Dashboard", href: "/dashboard", sortOrder: 0 },
      { label: "Chat", href: "/chat", sortOrder: 1 },
      { label: "Marketplace", href: "/marketplace", sortOrder: 2 },
      { label: "Channels", href: "/channels", sortOrder: 3 },
      { label: "Plugins", href: "/plugins", sortOrder: 4 },
      { label: "Instances", href: "/instances", sortOrder: 5 },
      { label: "Changesets", href: "/changesets", sortOrder: 6 },
      { label: "Network", href: "/dashboard/network", sortOrder: 7 },
      { label: "Fleet Health", href: "/fleet/health", sortOrder: 8 },
      { label: "Credits", href: "/billing/credits", sortOrder: 9 },
      { label: "Billing", href: "/billing/plans", sortOrder: 10 },
      { label: "Settings", href: "/settings/profile", sortOrder: 11 },
      { label: "Admin", href: "/admin/tenants", sortOrder: 12 },
    ],
    fleet: { containerImage: "ghcr.io/wopr-network/wopr:latest", lifecycle: "managed", billingModel: "monthly", maxInstances: 5 },
  },
  paperclip: {
    brandName: "Paperclip",
    productName: "Paperclip",
    tagline: "AI agents that run your business.",
    domain: "runpaperclip.com",
    appDomain: "app.runpaperclip.com",
    cookieDomain: ".runpaperclip.com",
    companyLegal: "Paperclip AI Inc.",
    priceLabel: "$5/month",
    defaultImage: "ghcr.io/wopr-network/paperclip:managed",
    emailSupport: "support@runpaperclip.com",
    emailPrivacy: "privacy@runpaperclip.com",
    emailLegal: "legal@runpaperclip.com",
    fromEmail: "noreply@runpaperclip.com",
    homePath: "/instances",
    storagePrefix: "paperclip",
    navItems: [
      { label: "Instances", href: "/instances", sortOrder: 0 },
      { label: "Credits", href: "/billing/credits", sortOrder: 1 },
      { label: "Settings", href: "/settings/profile", sortOrder: 2 },
      { label: "Admin", href: "/admin/tenants", sortOrder: 3 },
    ],
    fleet: { containerImage: "ghcr.io/wopr-network/paperclip:managed", lifecycle: "managed", billingModel: "monthly", maxInstances: 5 },
  },
  holyship: {
    brandName: "Holy Ship",
    productName: "Holy Ship",
    tagline: "Ship it.",
    domain: "holyship.wtf",
    appDomain: "app.holyship.wtf",
    cookieDomain: ".holyship.wtf",
    companyLegal: "WOPR Network Inc.",
    priceLabel: "",
    defaultImage: "ghcr.io/wopr-network/holyship:latest",
    emailSupport: "support@holyship.wtf",
    emailPrivacy: "privacy@holyship.wtf",
    emailLegal: "legal@holyship.wtf",
    fromEmail: "noreply@holyship.wtf",
    homePath: "/dashboard",
    storagePrefix: "holyship",
    navItems: [
      { label: "Dashboard", href: "/dashboard", sortOrder: 0 },
      { label: "Ship", href: "/ship", sortOrder: 1 },
      { label: "Approvals", href: "/approvals", sortOrder: 2 },
      { label: "Connect", href: "/connect", sortOrder: 3 },
      { label: "Credits", href: "/billing/credits", sortOrder: 4 },
      { label: "Settings", href: "/settings/profile", sortOrder: 5 },
      { label: "Admin", href: "/admin/tenants", sortOrder: 6 },
    ],
    fleet: { containerImage: "ghcr.io/wopr-network/holyship:latest", lifecycle: "ephemeral", billingModel: "none", maxInstances: 50 },
  },
  nemoclaw: {
    brandName: "NemoPod",
    productName: "NemoPod",
    tagline: "NVIDIA NeMo, one click away",
    domain: "nemopod.com",
    appDomain: "app.nemopod.com",
    cookieDomain: ".nemopod.com",
    companyLegal: "WOPR Network Inc.",
    priceLabel: "$5 free credits",
    defaultImage: "ghcr.io/wopr-network/nemoclaw:latest",
    emailSupport: "support@nemopod.com",
    emailPrivacy: "privacy@nemopod.com",
    emailLegal: "legal@nemopod.com",
    fromEmail: "noreply@nemopod.com",
    homePath: "/instances",
    storagePrefix: "nemopod",
    navItems: [
      { label: "NemoClaws", href: "/instances", sortOrder: 0 },
      { label: "Credits", href: "/billing/credits", sortOrder: 1 },
      { label: "Settings", href: "/settings/profile", sortOrder: 2 },
      { label: "Admin", href: "/admin/tenants", sortOrder: 3 },
    ],
    fleet: { containerImage: "ghcr.io/wopr-network/nemoclaw:latest", lifecycle: "managed", billingModel: "monthly", maxInstances: 5 },
  },
};

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: dbUrl });
  const db = drizzle(pool, { schema });

  const slugs = process.argv.includes("--all")
    ? Object.keys(PRODUCT_PRESETS)
    : [process.env.PRODUCT_SLUG ?? "wopr"];

  for (const slug of slugs) {
    const preset = PRODUCT_PRESETS[slug];
    if (!preset) {
      console.error(`Unknown product slug: ${slug}`);
      continue;
    }

    console.log(`Seeding ${slug}...`);

    const { navItems, fleet, ...productData } = preset;

    // Upsert product
    const [product] = await db
      .insert(schema.products)
      .values({ slug, ...productData })
      .onConflictDoUpdate({ target: schema.products.slug, set: productData })
      .returning();

    // Replace nav items
    await db.delete(schema.productNavItems).where(
      require("drizzle-orm").eq(schema.productNavItems.productId, product.id),
    );
    if (navItems.length > 0) {
      await db.insert(schema.productNavItems).values(
        navItems.map((item) => ({ productId: product.id, ...item })),
      );
    }

    // Upsert fleet config
    await db
      .insert(schema.productFleetConfig)
      .values({ productId: product.id, ...fleet })
      .onConflictDoUpdate({ target: schema.productFleetConfig.productId, set: fleet });

    // Features with defaults
    await db
      .insert(schema.productFeatures)
      .values({ productId: product.id })
      .onConflictDoNothing();

    console.log(`  ✓ ${slug} seeded (${navItems.length} nav items)`);
  }

  await pool.end();
  console.log("Done.");
}

seed().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add scripts/seed-products.ts
git commit -m "feat: add product config seed script for all 4 products"
```

---

## Phase 3: Admin UI (platform-ui-core)

### Task 8: Admin Products Page Shell

**Files:**
- Create: `src/app/admin/products/page.tsx`
- Create: `src/app/admin/products/loading.tsx`
- Create: `src/app/admin/products/error.tsx`

- [ ] **Step 1: Create page with tab layout**

The page loads the current product config via tRPC admin endpoint, then renders tabs for each config domain (Brand, Navigation, Features, Fleet, Billing). Each tab contains a form component.

```typescript
// src/app/admin/products/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpcVanilla } from "@/lib/trpc";
import { BrandForm } from "@/components/admin/products/brand-form";
import { NavEditor } from "@/components/admin/products/nav-editor";
import { FeaturesForm } from "@/components/admin/products/features-form";
import { FleetForm } from "@/components/admin/products/fleet-form";
import { BillingForm } from "@/components/admin/products/billing-form";

export default function AdminProductsPage() {
  const [config, setConfig] = useState<Awaited<ReturnType<typeof trpcVanilla.product.admin.get.query>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await trpcVanilla.product.admin.get.query();
      setConfig(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load config");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="p-6 text-red-400">{error}</div>;
  if (!config) return null;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Product Configuration</h1>
      <p className="text-muted-foreground">
        {config.product.productName} ({config.product.slug})
      </p>

      <Tabs defaultValue="brand">
        <TabsList>
          <TabsTrigger value="brand">Brand</TabsTrigger>
          <TabsTrigger value="navigation">Navigation</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="brand">
          <BrandForm product={config.product} onSaved={load} />
        </TabsContent>
        <TabsContent value="navigation">
          <NavEditor items={config.navItems} onSaved={load} />
        </TabsContent>
        <TabsContent value="features">
          <FeaturesForm features={config.features} onSaved={load} />
        </TabsContent>
        <TabsContent value="fleet">
          <FleetForm fleet={config.fleet} onSaved={load} />
        </TabsContent>
        <TabsContent value="billing">
          <BillingForm billing={config.billing} onSaved={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Create loading and error boundaries**

```typescript
// src/app/admin/products/loading.tsx
export default function Loading() {
  return <div className="p-6 animate-pulse">Loading product configuration...</div>;
}
```

```typescript
// src/app/admin/products/error.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Error loading product config</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{error.message}</p>
          <Button onClick={reset}>Retry</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/products/
git commit -m "feat: add admin products page shell with tabs"
```

---

### Task 9: Brand Form Component

**Files:**
- Create: `src/components/admin/products/brand-form.tsx`

- [ ] **Step 1: Write brand form**

Follow the existing promotion-form.tsx pattern: state-based, shadcn components, tRPC mutations.

```typescript
// src/components/admin/products/brand-form.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { trpcVanilla } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  product: {
    brandName: string;
    productName: string;
    tagline: string;
    domain: string;
    appDomain: string;
    cookieDomain: string;
    companyLegal: string;
    priceLabel: string;
    defaultImage: string;
    emailSupport: string;
    emailPrivacy: string;
    emailLegal: string;
    fromEmail: string;
    homePath: string;
    storagePrefix: string;
  };
  onSaved: () => void;
}

export function BrandForm({ product, onSaved }: Props) {
  const [form, setForm] = useState(product);
  const [saving, setSaving] = useState(false);

  const update = (field: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await trpcVanilla.product.admin.updateBrand.mutate(form);
      toast.success("Brand config saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const fields: Array<{ key: keyof typeof form; label: string }> = [
    { key: "brandName", label: "Brand Name" },
    { key: "productName", label: "Product Name" },
    { key: "tagline", label: "Tagline" },
    { key: "domain", label: "Domain" },
    { key: "appDomain", label: "App Domain" },
    { key: "cookieDomain", label: "Cookie Domain" },
    { key: "companyLegal", label: "Company Legal Name" },
    { key: "priceLabel", label: "Price Label" },
    { key: "defaultImage", label: "Default Container Image" },
    { key: "emailSupport", label: "Support Email" },
    { key: "emailPrivacy", label: "Privacy Email" },
    { key: "emailLegal", label: "Legal Email" },
    { key: "fromEmail", label: "From Email (notifications)" },
    { key: "homePath", label: "Home Path (post-login redirect)" },
    { key: "storagePrefix", label: "Storage Prefix" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand Identity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              value={form[key]}
              onChange={(e) => update(key, e.target.value)}
            />
          </div>
        ))}
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Brand Config"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/products/brand-form.tsx
git commit -m "feat: add brand identity admin form"
```

---

### Task 10: Navigation Editor Component

**Files:**
- Create: `src/components/admin/products/nav-editor.tsx`

- [ ] **Step 1: Write nav editor**

List of nav items with add/remove/reorder/toggle. No drag-and-drop library needed for v1 — use up/down buttons.

```typescript
// src/components/admin/products/nav-editor.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpcVanilla } from "@/lib/trpc";
import { toast } from "sonner";

interface NavItem {
  label: string;
  href: string;
  icon?: string | null;
  sortOrder: number;
  requiresRole?: string | null;
  enabled: string;
}

interface Props {
  items: NavItem[];
  onSaved: () => void;
}

export function NavEditor({ items: initialItems, onSaved }: Props) {
  const [items, setItems] = useState<NavItem[]>(
    [...initialItems].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [saving, setSaving] = useState(false);

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = [...items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setItems(next.map((item, i) => ({ ...item, sortOrder: i })));
  };

  const moveDown = (idx: number) => {
    if (idx === items.length - 1) return;
    const next = [...items];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    setItems(next.map((item, i) => ({ ...item, sortOrder: i })));
  };

  const toggle = (idx: number) => {
    const next = [...items];
    next[idx] = { ...next[idx], enabled: next[idx].enabled === "true" ? "false" : "true" };
    setItems(next);
  };

  const remove = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sortOrder: i })));
  };

  const add = () => {
    setItems([...items, { label: "", href: "/", sortOrder: items.length, enabled: "true" }]);
  };

  const updateField = (idx: number, field: "label" | "href", value: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    setItems(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await trpcVanilla.product.admin.updateNavItems.mutate(
        items.map((item) => ({
          label: item.label,
          href: item.href,
          icon: item.icon ?? undefined,
          sortOrder: item.sortOrder,
          requiresRole: item.requiresRole ?? undefined,
          enabled: item.enabled !== "false",
        })),
      );
      toast.success("Navigation saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Navigation Items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-6">{idx}</span>
            <Input
              className="flex-1"
              placeholder="Label"
              value={item.label}
              onChange={(e) => updateField(idx, "label", e.target.value)}
            />
            <Input
              className="flex-1"
              placeholder="/path"
              value={item.href}
              onChange={(e) => updateField(idx, "href", e.target.value)}
            />
            <Button variant="ghost" size="sm" onClick={() => moveUp(idx)} disabled={idx === 0}>
              ↑
            </Button>
            <Button variant="ghost" size="sm" onClick={() => moveDown(idx)} disabled={idx === items.length - 1}>
              ↓
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toggle(idx)}>
              {item.enabled === "true" ? "On" : "Off"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => remove(idx)}>
              ✕
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="outline" onClick={add}>Add Item</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Navigation"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/products/nav-editor.tsx
git commit -m "feat: add navigation item editor with reorder/toggle"
```

---

### Task 11: Features, Fleet, and Billing Forms

**Files:**
- Create: `src/components/admin/products/features-form.tsx`
- Create: `src/components/admin/products/fleet-form.tsx`
- Create: `src/components/admin/products/billing-form.tsx`

- [ ] **Step 1: Write features form**

Toggle switches for boolean flags, text inputs for string fields.

Pattern: same as brand-form but with `Checkbox` components for booleans.

```typescript
// src/components/admin/products/features-form.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { trpcVanilla } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  features: {
    chatEnabled: boolean;
    onboardingEnabled: boolean;
    onboardingDefaultModel: string | null;
    onboardingMaxCredits: number;
    onboardingWelcomeMsg: string | null;
    sharedModuleBilling: boolean;
    sharedModuleMonitoring: boolean;
    sharedModuleAnalytics: boolean;
  } | null;
  onSaved: () => void;
}

export function FeaturesForm({ features, onSaved }: Props) {
  const defaults = {
    chatEnabled: true,
    onboardingEnabled: true,
    onboardingDefaultModel: "",
    onboardingMaxCredits: 100,
    onboardingWelcomeMsg: "",
    sharedModuleBilling: true,
    sharedModuleMonitoring: true,
    sharedModuleAnalytics: true,
  };
  const [form, setForm] = useState({
    ...defaults,
    ...features,
    onboardingDefaultModel: features?.onboardingDefaultModel ?? "",
    onboardingWelcomeMsg: features?.onboardingWelcomeMsg ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await trpcVanilla.product.admin.updateFeatures.mutate(form);
      toast.success("Features saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggles: Array<{ key: keyof typeof form; label: string }> = [
    { key: "chatEnabled", label: "Chat Widget" },
    { key: "onboardingEnabled", label: "Onboarding Flow" },
    { key: "sharedModuleBilling", label: "Billing Module" },
    { key: "sharedModuleMonitoring", label: "Monitoring Module" },
    { key: "sharedModuleAnalytics", label: "Analytics Module" },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>Feature Flags</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {toggles.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <Checkbox
              checked={form[key] as boolean}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, [key]: !!checked }))}
            />
            <Label>{label}</Label>
          </div>
        ))}
        <div className="space-y-1">
          <Label>Onboarding Default Model</Label>
          <Input value={form.onboardingDefaultModel} onChange={(e) => setForm((prev) => ({ ...prev, onboardingDefaultModel: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Onboarding Max Credits</Label>
          <Input type="number" value={form.onboardingMaxCredits} onChange={(e) => setForm((prev) => ({ ...prev, onboardingMaxCredits: Number(e.target.value) }))} />
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Features"}</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write fleet form**

Dropdowns for lifecycle/billing model enums, number inputs for limits.

```typescript
// src/components/admin/products/fleet-form.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { trpcVanilla } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  fleet: {
    containerImage: string;
    containerPort: number;
    lifecycle: string;
    billingModel: string;
    maxInstances: number;
    dockerNetwork: string;
    placementStrategy: string;
    fleetDataDir: string;
  } | null;
  onSaved: () => void;
}

export function FleetForm({ fleet, onSaved }: Props) {
  const defaults = {
    containerImage: "",
    containerPort: 3100,
    lifecycle: "managed" as const,
    billingModel: "monthly" as const,
    maxInstances: 5,
    dockerNetwork: "",
    placementStrategy: "least-loaded",
    fleetDataDir: "/data/fleet",
  };
  const [form, setForm] = useState({ ...defaults, ...fleet });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await trpcVanilla.product.admin.updateFleet.mutate(form);
      toast.success("Fleet config saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Fleet Configuration</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Container Image</Label>
          <Input value={form.containerImage} onChange={(e) => setForm((prev) => ({ ...prev, containerImage: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label>Container Port</Label>
          <Input type="number" value={form.containerPort} onChange={(e) => setForm((prev) => ({ ...prev, containerPort: Number(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label>Lifecycle</Label>
          <Select value={form.lifecycle} onValueChange={(v) => setForm((prev) => ({ ...prev, lifecycle: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="managed">Managed (persistent)</SelectItem>
              <SelectItem value="ephemeral">Ephemeral (teardown on completion)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Billing Model</Label>
          <Select value={form.billingModel} onValueChange={(v) => setForm((prev) => ({ ...prev, billingModel: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly subscription</SelectItem>
              <SelectItem value="per_use">Per-use (credit gate)</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Max Instances Per Tenant</Label>
          <Input type="number" value={form.maxInstances} onChange={(e) => setForm((prev) => ({ ...prev, maxInstances: Number(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label>Docker Network</Label>
          <Input value={form.dockerNetwork} onChange={(e) => setForm((prev) => ({ ...prev, dockerNetwork: e.target.value }))} />
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Fleet Config"}</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write billing form**

Stripe keys (masked), credit price tiers, affiliate config.

```typescript
// src/components/admin/products/billing-form.tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { trpcVanilla } from "@/lib/trpc";
import { toast } from "sonner";

interface Props {
  billing: {
    stripePublishableKey: string | null;
    creditPrices: Record<string, number>;
    affiliateBaseUrl: string | null;
    affiliateMatchRate: string;
    affiliateMaxCap: number;
    dividendRate: string;
  } | null;
  onSaved: () => void;
}

export function BillingForm({ billing, onSaved }: Props) {
  const defaults = {
    stripePublishableKey: "",
    creditPrices: { "5": 500, "20": 2000, "50": 5000, "100": 10000, "500": 50000 },
    affiliateBaseUrl: "",
    affiliateMatchRate: 1.0,
    affiliateMaxCap: 20000,
    dividendRate: 1.0,
  };
  const [form, setForm] = useState({
    ...defaults,
    ...billing,
    stripePublishableKey: billing?.stripePublishableKey ?? "",
    affiliateBaseUrl: billing?.affiliateBaseUrl ?? "",
    affiliateMatchRate: Number(billing?.affiliateMatchRate ?? 1.0),
    dividendRate: Number(billing?.dividendRate ?? 1.0),
    creditPrices: (billing?.creditPrices as Record<string, number>) ?? defaults.creditPrices,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await trpcVanilla.product.admin.updateBilling.mutate(form);
      toast.success("Billing config saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const priceTiers = ["5", "20", "50", "100", "500"];

  return (
    <Card>
      <CardHeader><CardTitle>Billing Configuration</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Stripe Publishable Key</Label>
          <Input value={form.stripePublishableKey} onChange={(e) => setForm((prev) => ({ ...prev, stripePublishableKey: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Credit Prices (cents)</Label>
          {priceTiers.map((tier) => (
            <div key={tier} className="flex items-center gap-2">
              <span className="w-16 text-sm text-muted-foreground">${tier}:</span>
              <Input
                type="number"
                value={form.creditPrices[tier] ?? 0}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  creditPrices: { ...prev.creditPrices, [tier]: Number(e.target.value) },
                }))}
              />
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <Label>Affiliate Match Rate</Label>
          <Input type="number" step="0.1" value={form.affiliateMatchRate} onChange={(e) => setForm((prev) => ({ ...prev, affiliateMatchRate: Number(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label>Affiliate Max Cap (cents)</Label>
          <Input type="number" value={form.affiliateMaxCap} onChange={(e) => setForm((prev) => ({ ...prev, affiliateMaxCap: Number(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label>Dividend Rate</Label>
          <Input type="number" step="0.1" value={form.dividendRate} onChange={(e) => setForm((prev) => ({ ...prev, dividendRate: Number(e.target.value) }))} />
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Billing Config"}</Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/products/
git commit -m "feat: add features, fleet, and billing admin forms"
```

---

## Phase 4: Frontend Brand Config Migration

### Task 12: initBrandConfig() via tRPC

**Files:**
- Modify: `src/lib/brand-config.ts` (in platform-ui-core)

- [ ] **Step 1: Add initBrandConfig function**

Add after the existing `setBrandConfig` function:

```typescript
/**
 * Fetch brand config from the platform API and apply it.
 * Call once in root layout server component.
 * Falls back to env var defaults if API unavailable.
 */
export async function initBrandConfig(apiBaseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${apiBaseUrl}/trpc/product.getBrandConfig`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return; // fall back to env defaults
    const json = await res.json();
    const data = json?.result?.data;
    if (data) {
      setBrandConfig(data);
    }
  } catch {
    // API unavailable — env var defaults remain active
  }
}
```

- [ ] **Step 2: Run type check**

Run: `npm run check` (in platform-ui-core)
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/brand-config.ts
git commit -m "feat: add initBrandConfig() for tRPC-based brand config loading"
```

---

## Phase 5: Backend Module Migration (platform-core)

> **Note:** These tasks modify how existing platform-core modules read config. Each task is a standalone migration of one module — they can be done in any order. Each product backend adopts `PRODUCT_SLUG` + `initProductConfig()` at its own pace.

### Task 13: Platform Boot Function (eliminate code in products)

**Files:**
- Create: `src/boot.ts` (in platform-core)
- Modify: each product backend's `src/index.ts`

The goal: product backends call `platformBoot()` and platform-core auto-configures CORS, email, fleet defaults, brand config endpoint — all from DB. Products only add their own custom routes.

- [ ] **Step 1: Write platformBoot in platform-core**

```typescript
// src/boot.ts
import type { Hono } from "hono";
import type { DrizzleDb } from "./db/index.js";
import { initProductConfig, getProductConfig, deriveCorsOrigins } from "./product-config/index.js";

export interface PlatformBootOptions {
  slug: string;
  db: DrizzleDb;
  app: Hono;
  /** Additional CORS origins (e.g. DEV_ORIGINS from env). */
  devOrigins?: string[];
}

/**
 * Initialize platform-core modules from DB-driven product config.
 * Call once at startup, before serve().
 *
 * This replaces: BRAND_NAME, PLATFORM_DOMAIN, UI_ORIGIN, FROM_EMAIL,
 * SUPPORT_EMAIL, COOKIE_DOMAIN, and all other product-specific env vars
 * that platform-core modules previously read from process.env.
 */
export async function platformBoot(opts: PlatformBootOptions): Promise<void> {
  const { slug, db, app, devOrigins = [] } = opts;

  // 1. Initialize product config from DB
  initProductConfig(db);
  const config = await getProductConfig(slug);
  if (!config) throw new Error(`Product "${slug}" not found in DB. Run seed script.`);

  // 2. Auto-configure CORS from product domains
  const origins = [...deriveCorsOrigins(config.product, config.domains), ...devOrigins];
  // Wire into existing CORS middleware (implementation depends on current CORS setup)

  // 3. Auto-configure email (brand name, from email, support email)
  // Wire into existing notification service

  // 4. Auto-configure fleet defaults (lifecycle, billing model, container image)
  // Wire into fleet manager initialization

  // 5. Register product config tRPC endpoints
  // Already handled by router composition
}
```

- [ ] **Step 2: Migrate product backends one at a time**

Each product backend shrinks its `config.ts` to just infrastructure vars and calls `platformBoot()`:

```typescript
// paperclip-platform/src/index.ts — AFTER
import { platformBoot } from "@wopr-network/platform-core";

// After DB init:
await platformBoot({
  slug: process.env.PRODUCT_SLUG ?? "paperclip",
  db,
  app,
  devOrigins: process.env.DEV_ORIGINS?.split(","),
});
```

- [ ] **Step 3: Migrate platform-core modules to read from product config**

Each module migration is a separate commit. Priority:

1. **Email templates** — `brand_name`, `from_email`, `support_email` read from `getProductConfig()`
2. **CORS middleware** — origins derived from `product.domain` + `product.appDomain` + `product_domains`
3. **Fleet manager** — `container_image`, `lifecycle`, `billing_model` from `product_fleet_config`
4. **Billing module** — `credit_prices`, `affiliate_*` from `product_billing_config`
5. **Onboarding** — feature flags from `product_features`
6. **Auth/cookie** — `cookie_domain` from `product.cookieDomain`

- [ ] **Step 4: Each product backend removes absorbed env vars from its config.ts**

Paperclip's `config.ts` goes from ~30 env vars to ~12. The removed ones are now in DB, accessed via `getProductConfig()` inside platform-core modules.

- [ ] **Step 5: Commit per module**

```bash
git commit -m "feat: add platformBoot() to auto-configure core modules from DB"
git commit -m "refactor: migrate email templates to read from product config DB"
git commit -m "refactor: migrate CORS to derive origins from product config DB"
```

---

## Phase 6: Cleanup

### Task 14: Remove Absorbed Env Vars

- [ ] **Step 1: Remove from .env files**

After all modules read from DB, remove the absorbed env vars from:
- `platform-ui-core/.env.wopr`
- `platform-ui-core/.env.paperclip`
- Each product's `.env.example`
- Each product's `docker-compose.yml` build args

- [ ] **Step 2: Remove from Zod schemas**

Remove absorbed fields from each product's `src/config.ts` Zod schema.

- [ ] **Step 3: Remove setBrandConfig overrides from thin shells**

Each product UI's `src/lib/brand-config.ts` override becomes empty or deleted — `initBrandConfig()` handles everything.

- [ ] **Step 4: Remove Dockerfile build args**

Remove `ARG NEXT_PUBLIC_BRAND_*` lines from each product UI's Dockerfile.

- [ ] **Step 5: Final commit**

```bash
git commit -m "chore: remove absorbed env vars, Zod fields, and Dockerfile build args"
```

---

## Verification Checklist

After all phases:

- [ ] `npm run check` passes in platform-core
- [ ] `npm run check` passes in platform-ui-core
- [ ] `npx vitest run src/product-config/` passes in platform-core
- [ ] Seed script populates all 4 products: `npx tsx scripts/seed-products.ts --all`
- [ ] Admin UI at `/admin/products` shows brand/nav/features/fleet/billing tabs
- [ ] Changing nav items in admin UI reflects immediately on next page load
- [ ] Each product backend starts with just `PRODUCT_SLUG` + infrastructure env vars
- [ ] Holy Ship fleet config shows `lifecycle: ephemeral`, `billingModel: none`
- [ ] Adding a 5th product = 1 seed script entry + 1 `PRODUCT_SLUG` env var
