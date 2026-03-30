# Platform Boot Wiring Audit

**Date:** 2026-03-30
**Task:** Audit each platform's index.ts boot sequence and identify what buildContainer() should provide vs. what each product adds.

---

## Executive Summary

All 4 platforms follow a similar pattern:
1. Resolve secrets → build DATABASE_URL
2. Call `bootPlatformServer()` with config + features
3. Wire tRPC router dependencies from container
4. Initialize BetterAuth
5. Mount auth + product-specific routes
6. Call `start()`

**Key findings:**
- **Duplication:** Billing/org/settings/profile router deps wired identically in 3/4 platforms (paperclip, nemoclaw, wopr)
- **Gaps:** `buildContainer()` doesn't initialize BetterAuth, mount auth routes, or compose tRPC → platforms repeat this
- **WOPR outlier:** 1,498-line index.ts with 50+ `set*Deps()` calls + fleet/observability/admin logic that should move to core
- **Container limitation:** No product config in container (resolved post-boot); tRPC routers not wired in container

---

## Platform Audit Details

### 1. Paperclip Platform (`platforms/paperclip-platform/src/index.ts`)

**File size:** 269 lines

**bootPlatformServer() config:**
```typescript
{
  slug: "paperclip",
  secrets,
  databaseUrl,
  features: {
    fleet: !!databaseUrl,        // true
    crypto: !!databaseUrl,       // true
    stripe: !!secrets.stripeSecretKey,
    gateway: !!databaseUrl,      // true
    hotPool: false,              // ← not using hot pool
  }
}
```

**Container provides:**
- ✅ db, pool, productConfig
- ✅ creditLedger, orgMemberRepo, orgService, userRoleRepo
- ✅ fleet (docker, profileStore, proxy, serviceKeyRepo)
- ✅ crypto (chargeRepo, webhookSeenRepo)
- ✅ stripe (stripe client, processor, customerRepo)
- ✅ gateway (serviceKeyRepo, meter, budgetChecker)

**Product adds post-boot:**
```typescript
// Billing/org/settings/profile/page-context router deps
setTrpcOrgMemberRepo(container.orgMemberRepo);
setProductConfigRouterDeps(container.productConfigService, slug);
setTrpcDb(container.db);
setAuthHelpersDeps(container.orgMemberRepo);

if (container.stripe) {
  // 8 new repo instances + setBillingRouterDeps() + setOrgRouterDeps()
  const priceMap = loadCreditPriceMap();
  const usageSummaryRepo = new DrizzleUsageSummaryRepository(container.db);
  const meterAggregator = new DrizzleMeterAggregator(usageSummaryRepo);
  const autoTopupSettingsStore = new DrizzleAutoTopupSettingsRepository(container.db);
  const spendingLimitsRepo = new DrizzleSpendingLimitsRepository(container.db);
  const dividendRepo = new DrizzleDividendRepository(container.db);
  const affiliateRepo = new DrizzleAffiliateRepository(container.db);
  setBillingRouterDeps({ ... });
  setOrgRouterDeps({ ... });
}

// BetterAuth init (copies pool + secrets to auth system)
initBetterAuth({
  pool: container.pool,
  db: container.db,
  secret: secrets.betterAuthSecret,
  baseURL: `https://api.${productDomain}`,
  cookieDomain: `.${productDomain}`,
  socialProviders: { github?, google? },
  onUserCreated: async (userId) => { ... }
});
await runAuthMigrations();

// Mount auth routes
platform.app.route("/api/auth", createAuthRoutes(getAuth()));

// Mount tRPC
platform.app.all("/trpc/*", fetchRequestHandler({ router: appRouter, ... }));
```

**Product-specific logic:**
- NodeRegistry + placementStrategy for multi-node fleet
- OrgInstanceResolver + FleetResolverProxy
- AdminRouter + FleetRouter wiring

---

### 2. NemoClaw Platform (`platforms/nemoclaw-platform/src/index.ts`)

**File size:** 257 lines

**bootPlatformServer() config:**
```typescript
{
  slug: "nemoclaw",
  features: {
    fleet: !!databaseUrl,        // true
    crypto: !!databaseUrl,       // true
    stripe: !!secrets.stripeSecretKey,
    gateway: !!databaseUrl,      // true
    hotPool: !!databaseUrl,      // ← using hot pool (unique to nemoclaw)
  }
}
```

**Container provides:** (same as paperclip + **hotPool**)
- hotPool: { start(), claim(), getPoolSize(), setPoolSize() }

**Product adds post-boot:**
```typescript
// Auth FIRST (different order than paperclip)
initBetterAuth({ ... });
await runAuthMigrations();
platform.app.route("/api/auth", createAuthRoutes(getAuth()));

// Billing/org/settings/profile/page-context router deps (identical to paperclip)
setBillingRouterDeps({ ... });
setOrgRouterDeps({ ... });
setSettingsRouterDeps({ ... });
setProfileRouterDeps({ ... });
setPageContextRouterDeps({ ... });

// Core tRPC deps
setTrpcOrgMemberRepo(container.orgMemberRepo);
setProductConfigRouterDeps(container.productConfigService, slug);
setTrpcDb(container.db);
setAuthHelpersDeps(container.orgMemberRepo);

// Fleet + product-specific routes
if (container.fleet) {
  setFleetRouterDeps({ ... });
  setProvisionWebhookDeps({ ... });
  setChatRoutesDeps({ ... });  // ← NemoClaw-specific
}

// Mount chat + provision webhooks + tRPC
platform.app.route("/api/chat", chatRoutes);
platform.app.route("/api/provision", provisionWebhookRoutes);
platform.app.all("/trpc/*", fetchRequestHandler({ ... }));
```

**Product-specific logic:**
- Chat routes (engine, domain events, entity persistence)
- Provision webhook routes
- hotPool claim/start lifecycle

---

### 3. Holyship (`platforms/holyship/src/index.ts`)

**File size:** 767 lines (snippet: first 100 lines shown)

**bootPlatformServer() config:**
```typescript
{
  slug: "holyship",
  features: {
    fleet: false,        // ← not using fleet
    crypto: false,       // ← not using crypto
    stripe: stripeSecretKey ? true : false,
    gateway: false,      // ← not using gateway
    hotPool: false,
  }
}
```

**Container provides:** (minimal: core infra only)
- ✅ db, pool, productConfig
- ✅ creditLedger, orgMemberRepo, orgService, userRoleRepo
- ❌ fleet, crypto, gateway, hotPool (all null)
- ✅ stripe (conditional)

**Product adds post-boot (deferred, read rest of file to see):**
- Engine initialization + flow execution
- GitHub App integration + webhook routes
- Flow editor routes
- Interrogation routes
- Worker pool management
- Domain event persistence
- tRPC routing

---

### 4. WOPR Platform (`platforms/wopr-platform/src/index.ts`)

**File size:** 1,498 lines (snippet: first 150 lines shown)

**Key differences from others:**

1. **Custom singleton pattern:** Uses `getPool()`, `getDb()`, `getSecrets()` getter functions (defined in `src/fleet/services.ts`) instead of receiving container from bootPlatformServer().

2. **NOT calling bootPlatformServer():** WOPR manages its own DB pool + migrations via `runMigrations()` and custom Drizzle setup.

3. **Custom Hono app:** Imports `app` from `./api/app.js` (pre-configured Hono) instead of receiving from bootPlatformServer().

4. **Manual feature setup:** Manually wires each feature service (fleet, billing, observability, gateway) instead of using container.

5. **50+ set*Deps() calls:** Much heavier product-specific setup:
   - Fleet: imagePoller, updater, command bus, node registrar
   - Observability: Sentry, metrics, alert checker, PagerDuty
   - Monetization: dividend cron, topup scheduler, spending caps
   - Admin: health handler, rate limits
   - WebSocket: chat backends, heartbeat processing

6. **Email + NotificationService:** Custom email client initialization + notification service wiring.

7. **Background tasks:** Several crons running:
   - Credit expiry cron
   - Trial balance cron
   - Dividend cron
   - Dividend digest cron
   - Reconciliation cron

8. **WebSocket upgrade:** Custom `authenticateWebSocketUpgrade()` for real-time endpoints.

**Why WOPR is an outlier:**
- Predates `bootPlatformServer()` architecture
- Has its own migration strategy (not using core migrations)
- Custom multi-node fleet with GPU allocation
- Advanced observability (Sentry + PagerDuty)
- Multiple chat backends + heartbeat processing
- Older codebase with singletons vs. dependency injection

---

## What buildContainer() Already Provides

```typescript
interface PlatformContainer {
  // Core
  db: DrizzleDb;
  pool: Pool;
  productConfig: ProductConfig;
  productConfigService: ProductConfigService;

  // Credits + organization
  creditLedger: ILedger;
  orgMemberRepo: IOrgMemberRepository;
  orgService: OrgService;
  userRoleRepo: IUserRoleRepository;

  // Optional features (null if disabled)
  fleet: FleetServices | null;      // { manager, docker, proxy, profileStore, serviceKeyRepo }
  crypto: CryptoServices | null;    // { chargeRepo, webhookSeenRepo }
  stripe: StripeServices | null;    // { stripe, webhookSecret, customerRepo, processor }
  gateway: GatewayServices | null;  // { serviceKeyRepo, meter, budgetChecker }
  hotPool: HotPoolServices | null;  // { start, claim, getPoolSize, setPoolSize }
}
```

---

## What Each Platform Adds (Duplication Identified)

### Duplication: Billing/Org/Settings/Profile Router Wiring

**Happens in:** Paperclip, NemoClaw, and partially in WOPR

**Code pattern (identical across 3 platforms):**
```typescript
// 1. Load price map + create billing repos
const priceMap = loadCreditPriceMap();
const usageSummaryRepo = new DrizzleUsageSummaryRepository(container.db);
const meterAggregator = new DrizzleMeterAggregator(usageSummaryRepo);
const autoTopupSettingsStore = new DrizzleAutoTopupSettingsRepository(container.db);
const spendingLimitsRepo = new DrizzleSpendingLimitsRepository(container.db);
const dividendRepo = new DrizzleDividendRepository(container.db);
const affiliateRepo = new DrizzleAffiliateRepository(container.db);

// 2. Call setBillingRouterDeps() + setOrgRouterDeps()
setBillingRouterDeps({
  processor: container.stripe.processor,
  tenantRepo: container.stripe.customerRepo,
  creditLedger: container.creditLedger,
  meterAggregator,
  priceMap,
  autoTopupSettingsStore,
  dividendRepo,
  spendingLimitsRepo,
  affiliateRepo,
  productConfig: container.productConfig,
});

setOrgRouterDeps({
  orgService: container.orgService,
  authUserRepo,
  creditLedger: container.creditLedger,
  meterAggregator,
  processor: container.stripe.processor,
  priceMap,
});

// 3. Settings + Profile (also identical)
setSettingsRouterDeps({ getNotificationPrefsStore: () => notificationPrefsStore });
setProfileRouterDeps({
  getUser: (userId) => profileAuthUserRepo.getUser(userId),
  updateUser: (userId, data) => profileAuthUserRepo.updateUser(userId, data),
  changePassword: (userId, currentPassword, newPassword) =>
    profileAuthUserRepo.changePassword(userId, currentPassword, newPassword),
});

// 4. Page context (identical)
setPageContextRouterDeps({ repo: new DrizzlePageContextRepository(container.db) });
```

**Candidates for moving to core:**
- `loadCreditPriceMap()` call + billing repos creation → **buildContainer()**
- `setBillingRouterDeps()` + `setOrgRouterDeps()` calls → **bootPlatformServer()** after container build

---

## What Should Move into buildContainer() / bootPlatformServer()

### High-confidence moves (do this):

1. **Billing repos + deps (if stripe enabled):**
   - `DrizzleUsageSummaryRepository`
   - `DrizzleMeterAggregator`
   - `DrizzleAutoTopupSettingsRepository`
   - `DrizzleSpendingLimitsRepository`
   - `DrizzleDividendRepository`
   - `DrizzleAffiliateRepository`
   - `loadCreditPriceMap()`
   - Auto-wire: `setBillingRouterDeps()`, `setOrgRouterDeps()`

2. **Settings/Profile repos (always):**
   - `DrizzleNotificationPreferencesStore`
   - `DrizzlePageContextRepository`
   - `BetterAuthUserRepository`
   - Auto-wire: `setSettingsRouterDeps()`, `setProfileRouterDeps()`, `setPageContextRouterDeps()`

3. **Core tRPC wiring (always):**
   - `setTrpcOrgMemberRepo(container.orgMemberRepo)`
   - `setProductConfigRouterDeps(container.productConfigService, slug)`
   - `setTrpcDb(container.db)`
   - `setAuthHelpersDeps(container.orgMemberRepo)`

4. **BetterAuth initialization + routing (always):**
   - `initBetterAuth()` with product config from container
   - `await runAuthMigrations()`
   - Auto-mount `/api/auth` routes

### Medium-confidence moves (design first):

5. **Fleet-specific wiring (if fleet enabled):**
   - NodeRegistry + placementStrategy setup
   - `setFleetResolverProxy()`, `setOrgInstanceResolverDeps()`, `setFleetRouterDeps()`
   - Move to core? Or accept as product-specific?

6. **Product-specific routes (keep in products):**
   - `/api/chat` (NemoClaw)
   - `/api/provision` (NemoClaw)
   - `/api/ship-it` (Holyship)
   - `/api/github` (Holyship)
   - These are product-specific and should stay in product index.ts

### Low-confidence (WOPR outlier):

7. **WOPR-specific singletons + observability:**
   - Sentry, PagerDuty, metrics
   - Background crons (dividend, reconciliation, expiry)
   - WebSocket + chat backends
   - **Not recommended for core** — too WOPR-specific. Keep in WOPR index.ts.

---

## Gap Analysis: What buildContainer() Needs to Add

### Phase 1: Billing repos + router wiring (immediate, high-value)

**Add to `buildContainer()`:**
```typescript
// After stripe setup, before return
let billingRepos: BillingRepos | null = null;
if (bootConfig.features.stripe && stripe) {
  const priceMap = loadCreditPriceMap();
  const usageSummaryRepo = new DrizzleUsageSummaryRepository(db);
  const meterAggregator = new DrizzleMeterAggregator(usageSummaryRepo);
  const autoTopupSettingsStore = new DrizzleAutoTopupSettingsRepository(db);
  const spendingLimitsRepo = new DrizzleSpendingLimitsRepository(db);
  const dividendRepo = new DrizzleDividendRepository(db);
  const affiliateRepo = new DrizzleAffiliateRepository(db);

  billingRepos = {
    priceMap,
    usageSummaryRepo,
    meterAggregator,
    autoTopupSettingsStore,
    spendingLimitsRepo,
    dividendRepo,
    affiliateRepo,
  };
}

result.billingRepos = billingRepos;
```

**Add to `BootConfig`:**
```typescript
export interface BootConfig {
  // ... existing
  autoBuildBillingRepos?: boolean;  // default true
  autoWireTrpcRouters?: boolean;     // default true
  autoBuildAuthRoutes?: boolean;     // default true
}
```

**Add to `bootPlatformServer()`:**
```typescript
// After container build, before mounting routes
if (bootConfig.autoWireTrpcRouters ?? true) {
  setTrpcOrgMemberRepo(container.orgMemberRepo);
  setProductConfigRouterDeps(container.productConfigService, bootConfig.slug);
  setTrpcDb(container.db);
  setAuthHelpersDeps(container.orgMemberRepo);

  if (container.stripe && container.billingRepos) {
    setBillingRouterDeps({
      processor: container.stripe.processor,
      tenantRepo: container.stripe.customerRepo,
      creditLedger: container.creditLedger,
      meterAggregator: container.billingRepos.meterAggregator,
      priceMap: container.billingRepos.priceMap,
      autoTopupSettingsStore: container.billingRepos.autoTopupSettingsStore,
      dividendRepo: container.billingRepos.dividendRepo,
      spendingLimitsRepo: container.billingRepos.spendingLimitsRepo,
      affiliateRepo: container.billingRepos.affiliateRepo,
      productConfig: container.productConfig,
    });
  }

  // ... org, settings, profile, page-context router deps
}
```

### Phase 2: BetterAuth + auth routes (medium, foundational)

**Add to `bootPlatformServer()`:**
```typescript
// Before mounting product routes
if (bootConfig.autoBuildAuthRoutes ?? true) {
  const { initBetterAuth, runAuthMigrations } = await import("../auth/better-auth.js");
  const { createAuthRoutes, getAuth } = await import("../auth/better-auth.js");

  const productDomain = container.productConfig.product?.domain;
  initBetterAuth({
    pool: container.pool,
    db: container.db,
    secret: bootConfig.secrets?.betterAuthSecret ?? "",
    baseURL: productDomain ? `https://api.${productDomain}` : undefined,
    cookieDomain: productDomain ? `.${productDomain}` : undefined,
    trustedOrigins: productDomain
      ? [`https://${productDomain}`, `https://app.${productDomain}`]
      : undefined,
    socialProviders: {
      ...(bootConfig.secrets?.githubClientId && bootConfig.secrets?.githubClientSecret
        ? { github: { ... } }
        : {}),
      ...(bootConfig.secrets?.googleClientId && bootConfig.secrets?.googleClientSecret
        ? { google: { ... } }
        : {}),
    },
    onUserCreated: async (userId) => {
      // Auto-grant credits + create org
      try {
        const { grantSignupCredits } = await import("../credits/index.js");
        await grantSignupCredits(container.creditLedger, userId);
      } catch (err) {
        logger.error("Failed to grant signup credits", err);
      }
      // Org creation (optional, flag it)
    },
  });
  await runAuthMigrations();
  app.route("/api/auth", createAuthRoutes(getAuth()));
}
```

---

## Recommendations

### For Core (buildContainer + bootPlatformServer):

1. ✅ Move billing repos creation into `buildContainer()` (high-value duplication)
2. ✅ Auto-wire tRPC routers in `bootPlatformServer()` (reduces index.ts boilerplate by ~40 LOC per product)
3. ✅ Move BetterAuth init into `bootPlatformServer()` (reduces index.ts by ~30 LOC per product)
4. ✅ Auto-mount `/api/auth` routes in `bootPlatformServer()`
5. ⚠️ Make all of the above optional via `autoBuildXxx` flags in BootConfig (backward compatibility)

### For Products (index.ts):

1. **Keep:** Product-specific routes (`/api/chat`, `/api/provision`, `/api/ship-it`, etc.)
2. **Keep:** Product-specific wiring (NodeRegistry, FleetResolverProxy, etc.)
3. **Move to core (high-priority):** Billing repos + router wiring
4. **Keep as-is:** NemoClaw hotPool claim routing
5. **Keep as-is:** Holyship engine + GitHub integration
6. **Refactor candidate:** WOPR observability + crons (but too specific to refactor now)

### Migration Path:

1. **Week 1:** Add billing repos to buildContainer() + new BootConfig flags
2. **Week 2:** Auto-wire tRPC routers in bootPlatformServer()
3. **Week 3:** Move BetterAuth + auth routes into bootPlatformServer()
4. **Week 4+:** Update each platform's index.ts to remove the duplicated code (removes ~100 LOC per product)

---

## Files for Follow-up Investigation

- `/core/platform-core/src/server/mount-routes.ts` — what routes are mounted here vs. in product index.ts?
- `/core/platform-core/src/trpc/index.ts` — tRPC router setup
- `/platforms/*/src/trpc/index.ts` — product router composition
- `/platforms/paperclip-platform/src/fleet/` — fleet setup pattern
- `/platforms/wopr-platform/src/fleet/services.ts` — singleton wiring (reference for what NOT to do)

