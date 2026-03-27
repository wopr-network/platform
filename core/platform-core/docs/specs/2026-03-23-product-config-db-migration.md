# Product Configuration Database Migration

**Date:** 2026-03-23
**Status:** Draft
**Scope:** platform-core, platform-ui-core, all 4 product backends + UIs

## Problem

4 products (WOPR, Paperclip, Holy Ship, NemoClaw) are configured via environment variables. This worked at 1-2 products but is now unwieldy:

- **Adding a product** requires creating ~30 env vars across `.env` files, Dockerfiles, and docker-compose build args
- **Changing config** (routes, nav, pricing) requires a rebuild/redeploy
- **Complex data** is crammed into env vars (JSON nav items, multi-tier pricing)
- **Per-tenant overrides** are impossible without code changes
- **Backend repos get forked** per product with hardcoded domain strings

### Current State

| Repo | Product-Configurable Env Vars | Pattern |
|------|------------------------------|---------|
| platform-core | ~28 | Zod schema reads `process.env` |
| platform-ui-core | ~18 | `NEXT_PUBLIC_BRAND_*` → `envDefaults()` → `setBrandConfig()` |
| paperclip-platform | ~30 | Own `config.ts` with Zod, imports platform-core |
| nemoclaw-platform | ~25 | Forked backend, hardcoded `nemopod.com` in source |
| holyship | ~15 | Hardcoded `holyship.wtf` in config, reimplements fleet for ephemeral containers |

**Total:** ~46 unique product-configurable vars, duplicated 4x across products = ~184 env var entries maintained.

### Pain Points by Product

- **WOPR:** Low pain (it's the default everything was built for)
- **Paperclip:** Medium — clean thin shell pattern, but 19 `NEXT_PUBLIC_BRAND_*` vars + build-time injection
- **NemoClaw:** High — forked backend with hardcoded `nemopod.com` strings in source
- **Holy Ship:** Highest — reimplements 631 lines of fleet management because platform-core's fleet assumes persistent, monthly-billed containers

## Design

### Principle

**Config in DB, custom behavior in code.** The database eliminates env var sprawl and unlocks behavioral knobs. Product backends still own their specific provisioning logic (e.g., Holy Ship's 7-step ephemeral lifecycle).

### What Moves to DB (~46 vars)

Product identity, branding, navigation, feature flags, fleet configuration, billing configuration.

### What Stays as Env Vars (~12 per product)

Infrastructure: `DATABASE_URL`, `PORT`, `HOST`, `NODE_ENV`, `PRODUCT_SLUG`, `PROVISION_SECRET`, `GATEWAY_URL`, `GATEWAY_API_KEY`, `OPENROUTER_API_KEY`, `CADDY_ADMIN_URL`, `CLOUDFLARE_API_TOKEN`, `ADMIN_API_KEY`.

These are deployment-specific, secret, or infrastructure-wiring concerns that don't belong in a shared database.

Additionally, `DEV_ORIGINS` (local dev CORS origins) stays as an env var — it's per-developer, not per-product.

### New Env Var: `PRODUCT_SLUG`

Each product backend sets one env var that identifies which DB row to read:

```
PRODUCT_SLUG=paperclip   # everything else comes from DB
```

## Schema

### `products`

The anchor table. One row per product deployment.

```sql
CREATE TABLE products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,  -- 'wopr', 'paperclip', 'holyship', 'nemoclaw'
  brand_name    TEXT NOT NULL,         -- 'Paperclip'
  product_name  TEXT NOT NULL,         -- 'Paperclip'
  tagline       TEXT NOT NULL DEFAULT '',
  domain        TEXT NOT NULL,         -- 'runpaperclip.com'
  app_domain    TEXT NOT NULL,         -- 'app.runpaperclip.com'
  cookie_domain TEXT NOT NULL,         -- '.runpaperclip.com'
  company_legal TEXT NOT NULL DEFAULT '',
  price_label   TEXT NOT NULL DEFAULT '',
  default_image TEXT NOT NULL DEFAULT '',
  email_support TEXT NOT NULL DEFAULT '',
  email_privacy TEXT NOT NULL DEFAULT '',
  email_legal   TEXT NOT NULL DEFAULT '',
  from_email    TEXT NOT NULL DEFAULT '',  -- noreply@runpaperclip.com
  home_path     TEXT NOT NULL DEFAULT '/marketplace',
  storage_prefix TEXT NOT NULL,        -- 'paperclip' (derives envVarPrefix, toolPrefix, eventPrefix, tenantCookieName)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Replaces:** all 18 `NEXT_PUBLIC_BRAND_*` env vars + `BRAND_NAME`, `SUPPORT_EMAIL`, `PLATFORM_DOMAIN`, `FROM_EMAIL`, `APP_BASE_URL` from backend configs.

**CORS derivation:** `UI_ORIGIN` is no longer an env var. The backend computes allowed origins from `products.domain` + `products.app_domain` + `product_domains` entries + `DEV_ORIGINS` env var (local dev only). Example: product with `domain=runpaperclip.com`, `app_domain=app.runpaperclip.com` → CORS allows `https://runpaperclip.com`, `https://app.runpaperclip.com`.

**Derived fields (computed in code, not stored):**
- `envVarPrefix` = `storage_prefix.toUpperCase()` (e.g., `PAPERCLIP`)
- `toolPrefix` = `storage_prefix` (e.g., `paperclip`)
- `eventPrefix` = `storage_prefix` (e.g., `paperclip`)
- `tenantCookieName` = `${storage_prefix}_tenant_id`

Same derivation logic already in `setBrandConfig()`.

### `product_nav_items`

Replaces `NEXT_PUBLIC_BRAND_NAV_ITEMS` JSON blob and thin shell `setBrandConfig({ navItems })` overrides.

```sql
CREATE TABLE product_nav_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,           -- 'Ship'
  href          TEXT NOT NULL,           -- '/ship'
  icon          TEXT,                    -- optional icon identifier
  sort_order    INTEGER NOT NULL,        -- display order
  requires_role TEXT,                    -- null = everyone, 'platform_admin' = admin only
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_nav_items_product ON product_nav_items(product_id, sort_order);
```

**Admin UI:** drag-and-drop reorder, toggle visibility, add/remove items per product. No code changes to modify navigation.

### `product_features`

Replaces `NEXT_PUBLIC_BRAND_CHAT_ENABLED`, `ONBOARDING_*` env vars, `SHARED_MODULE_*` flags.

```sql
CREATE TABLE product_features (
  product_id              UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  chat_enabled            BOOLEAN NOT NULL DEFAULT true,
  onboarding_enabled      BOOLEAN NOT NULL DEFAULT true,
  onboarding_default_model TEXT,
  onboarding_system_prompt TEXT,
  onboarding_max_credits  INTEGER NOT NULL DEFAULT 100,
  onboarding_welcome_msg  TEXT,
  shared_module_billing   BOOLEAN NOT NULL DEFAULT true,
  shared_module_monitoring BOOLEAN NOT NULL DEFAULT true,
  shared_module_analytics BOOLEAN NOT NULL DEFAULT true,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `product_fleet_config`

Replaces `PAPERCLIP_IMAGE`, `FLEET_*`, `MAX_INSTANCES_PER_TENANT`, `NEMOCLAW_IMAGE`, `FLEET_IMAGE_ALLOWLIST` env vars. **Solves the Holy Ship ephemeral container problem** by making lifecycle and billing model explicit knobs.

```sql
CREATE TYPE fleet_lifecycle AS ENUM ('managed', 'ephemeral');
CREATE TYPE fleet_billing_model AS ENUM ('monthly', 'per_use', 'none');

CREATE TABLE product_fleet_config (
  product_id          UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  container_image     TEXT NOT NULL,         -- 'ghcr.io/wopr-network/paperclip:managed'
  container_port      INTEGER NOT NULL DEFAULT 3100,
  lifecycle           fleet_lifecycle NOT NULL DEFAULT 'managed',
  billing_model       fleet_billing_model NOT NULL DEFAULT 'monthly',
  max_instances       INTEGER NOT NULL DEFAULT 5,
  image_allowlist     TEXT[],                -- null = any, or ['ghcr.io/wopr-network/nemoclaw:*']
  docker_network      TEXT NOT NULL DEFAULT '',
  placement_strategy  TEXT NOT NULL DEFAULT 'least-loaded',
  fleet_data_dir      TEXT NOT NULL DEFAULT '/data/fleet',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**How fleet code uses this:**
- `lifecycle = 'ephemeral'` → skip persistent instance tracking, auto-teardown on completion
- `billing_model = 'none'` → skip runtime billing cron for this product's containers
- `billing_model = 'per_use'` → bill at gateway layer (credit-gate), not per-container

Product backends still own their specific provisioning logic. Holy Ship's `HolyshipperFleetManager` (credential injection, repo checkout, worker pool) stays in the holyship repo. It just reads fleet config from DB instead of env vars.

### `product_billing_config`

Replaces `STRIPE_*`, `AFFILIATE_*`, `MARGIN_CONFIG_JSON` env vars.

```sql
CREATE TABLE product_billing_config (
  product_id              UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  stripe_publishable_key  TEXT,
  stripe_secret_key       TEXT,              -- encrypted at rest
  stripe_webhook_secret   TEXT,              -- encrypted at rest
  credit_prices           JSONB NOT NULL DEFAULT '{}', -- {"5": 500, "20": 2000, "50": 5000, "100": 10000, "500": 50000}
  affiliate_base_url      TEXT,
  affiliate_match_rate    NUMERIC NOT NULL DEFAULT 1.0,
  affiliate_max_cap       INTEGER NOT NULL DEFAULT 20000,
  dividend_rate           NUMERIC NOT NULL DEFAULT 1.0,
  margin_config           JSONB,             -- arbitrage rules
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Note on Stripe secrets:** These are per-product (each product has its own Stripe account). Encrypted using the existing `CRYPTO_SERVICE_KEY` envelope encryption in platform-core's credential vault.

### `product_domains`

Optional multi-domain support (Holy Ship uses holyship.wtf canonical + holyship.dev redirect).

```sql
CREATE TABLE product_domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  host        TEXT NOT NULL,             -- 'holyship.wtf'
  role        TEXT NOT NULL DEFAULT 'canonical', -- 'canonical' | 'redirect'
  UNIQUE(product_id, host)
);
```

Maps directly to the existing `BrandDomain` interface in `brand-config.ts`.

## tRPC Endpoints

New router: `product` (in platform-core, composed into each product's appRouter).

### Public (cached aggressively)

```typescript
product.getBrandConfig    // → BrandConfig (full UI config including nav, features)
product.getNavItems       // → NavItem[] (ordered, filtered by role)
product.getFeatures       // → FeatureFlags
```

### Admin (platform_admin role)

```typescript
product.admin.get              // → full ProductConfig
product.admin.updateBrand      // → update products table
product.admin.updateNavItems   // → replace product_nav_items rows
product.admin.updateFeatures   // → update product_features row
product.admin.updateFleet      // → update product_fleet_config row
product.admin.updateBilling    // → update product_billing_config row
```

### Backend (internal)

```typescript
product.internal.getFleetConfig    // → FleetConfig (for fleet module)
product.internal.getBillingConfig  // → BillingConfig (for billing module)
product.internal.getFullConfig     // → everything (startup cache)
```

## UI Integration

### How `brand-config.ts` Changes

```typescript
// BEFORE: env vars at build time
let _config: BrandConfig = envDefaults();

// AFTER: env vars as fallback, DB via tRPC as source of truth
let _config: BrandConfig = envDefaults(); // still works for local dev

export async function initBrandConfig(): Promise<void> {
  try {
    const dbConfig = await trpc.product.getBrandConfig.query();
    setBrandConfig(dbConfig);
  } catch {
    // Fall back to env vars — local dev or tRPC unavailable
    console.warn('Failed to fetch brand config from API, using env defaults');
  }
}
```

Called once in the root layout's server component. Cached aggressively (revalidate every 60s or on admin mutation).

### Thin Shells After Migration

Each product's UI shell shrinks from "19 env vars + setBrandConfig override" to nearly nothing:

```typescript
// paperclip-platform-ui/src/app/layout.tsx — AFTER
import { initBrandConfig } from "@core/lib/brand-config";

export default async function RootLayout({ children }) {
  await initBrandConfig(); // fetches from DB via tRPC
  return <html>...</html>;
}
```

No `.env.paperclip`, no `.env.brand`, no `setBrandConfig({ navItems: [...] })`. The thin shell just needs `NEXT_PUBLIC_API_URL` pointing at the right backend — which already knows its `PRODUCT_SLUG`.

### Admin UI

New `/admin/products` page (added to platform-ui-core):

**Sections:**
1. **Brand Identity** — product name, tagline, domain, emails, legal name, pricing label
2. **Navigation** — drag-and-drop nav item editor, per-item role gating, enable/disable
3. **Features** — toggle switches for chat, onboarding, shared modules
4. **Fleet** — lifecycle dropdown (managed/ephemeral), billing model, container image, limits
5. **Billing** — Stripe keys (masked), credit price tiers, affiliate config, margin rules

Each section saves independently via the admin tRPC mutations.

## Migration Path

### Phase 1: Tables + Seed (no behavior change)

1. Add Drizzle schema for all 6 tables
2. Run `drizzle-kit generate` for migration
3. Seed script reads current env vars and populates DB rows for all 4 products
4. All existing behavior unchanged — modules still read env vars

### Phase 2: tRPC Endpoints + Admin UI

1. Add `product` tRPC router to platform-core
2. Add `/admin/products` page to platform-ui-core
3. Admin can now view/edit product config in DB
4. Modules still read env vars (DB is source of truth for admin, not yet for runtime)

### Phase 3: Backend Migration (one module at a time)

1. Add `getProductConfig(slug)` to platform-core — reads from DB, caches in memory
2. Migrate fleet module: read `container_image`, `lifecycle`, `billing_model` from DB
3. Migrate billing module: read `credit_prices`, `stripe_*`, `affiliate_*` from DB
4. Migrate auth/CORS: read `domain`, `app_domain`, `cookie_domain` from DB
5. Migrate email: read `from_email`, `brand_name`, `support_email` from DB
6. Each product backend's `config.ts` shrinks as env vars get absorbed

### Phase 4: Frontend Migration

1. Add `initBrandConfig()` that fetches from tRPC
2. Call in root layout server component
3. Remove `NEXT_PUBLIC_BRAND_*` from `.env` files
4. Remove `setBrandConfig()` overrides from thin shells
5. Thin shells reduce to just `NEXT_PUBLIC_API_URL`

### Phase 5: Cleanup

1. Remove absorbed env vars from `.env.example` files
2. Remove absorbed Zod schema fields from product `config.ts` files
3. Remove `.env.wopr`, `.env.paperclip`, `.env.holyship` preset files
4. Update Dockerfiles to remove build args that are no longer needed
5. Update docker-compose files to remove env var forwarding

## Per-Tenant Overrides (Future)

Once products are in DB, per-tenant overrides become natural:

```sql
CREATE TABLE tenant_config_overrides (
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  product_id  UUID NOT NULL REFERENCES products(id),
  key         TEXT NOT NULL,             -- 'nav_items', 'chat_enabled', 'max_instances'
  value       JSONB NOT NULL,
  PRIMARY KEY (tenant_id, product_id, key)
);
```

Resolution order: tenant override → product config → platform defaults.

Not in scope for this migration, but the schema is designed to support it.

## Risks

1. **Cache invalidation** — admin changes brand config, UI serves stale config. Mitigation: 60s TTL on tRPC cache + cache-bust on admin mutation.
2. **Cold start** — first request after deploy hits DB for config. Mitigation: backend pre-fetches config on startup and caches in memory.
3. **Stripe secrets in DB** — must be encrypted at rest. Mitigation: use existing platform-core credential vault (`CRYPTO_SERVICE_KEY` envelope encryption).
4. **Next.js middleware** — `proxy.ts` reads `NEXT_PUBLIC_BRAND_HOME_PATH` at build time for auth redirects. A tRPC fetch per middleware invocation is too expensive. **Solution:** the product backend exposes a `GET /api/product-config` endpoint that the UI fetches once at server startup and caches in a module-level variable. Middleware reads from this in-memory cache. Cache is refreshed on admin mutation via a webhook or on a 60s interval. `NEXT_PUBLIC_BRAND_HOME_PATH` env var remains as a build-time fallback for the edge case where the API is unreachable at startup.

## Success Criteria

- [ ] Adding a 5th product requires: 1 DB seed script, 1 new `PRODUCT_SLUG` env var, 0 new `.env` files
- [ ] Changing nav items, feature flags, or pricing requires: admin UI click, 0 redeploys
- [ ] Holy Ship fleet config reads `lifecycle: ephemeral` + `billing_model: none` from DB
- [ ] Each product backend's `config.ts` has <=12 env vars (down from 25-30)
- [ ] Brand config served via tRPC, not baked into Next.js bundle
- [ ] Per-tenant overrides are structurally possible (table exists or can be added trivially)
