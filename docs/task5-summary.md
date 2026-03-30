# Task 5: Move tRPC Routers into Platform-Core

**Date**: 2026-03-30
**Status**: Complete

---

## What Was Done

### Step 1: Added DI Factory Functions to Existing Core Routers

Three routers already existed in `core/platform-core/src/trpc/routers/` with the `set*Deps()` singleton pattern. Added `create*Router(deps)` factory functions alongside the existing singletons for backwards compatibility:

- **`settings.ts`** — Added `createSettingsRouter(deps: SettingsRouterDeps)`
- **`profile.ts`** — Added `createProfileRouter(deps: ProfileRouterDeps)`
- **`page-context.ts`** — Added `createPageContextRouter(deps: PageContextRouterDeps)`

### Step 2: Created New Core Routers (DI-only)

Three new routers created in `core/platform-core/src/trpc/routers/`:

- **`billing.ts`** — `createBillingRouter(deps: BillingRouterDeps)` — All 36 procedures from the canonical paperclip-platform billing router. Deps include `assertOrgAdminOrOwner` callback instead of importing platform-specific auth helpers.

- **`org.ts`** — `createOrgRouter(deps: OrgRouterDeps)` — All 16 procedures (org CRUD, invites, org-level billing). Product-specific fleet sync (MemberProvisionClient) replaced with generic `onMemberChanged` callback in deps.

- **`fleet-core.ts`** — `createFleetCoreRouter(deps: FleetCoreRouterDeps)` — 11 shared procedures (listInstances, getInstance, controlInstance, getInstanceHealth, getInstanceLogs, getInstanceMetrics, listTemplates). Product-specific procedures (WOPR's 14 DHT/GPU/node procedures, Paperclip's createInstance with Docker provisioning) stay in their respective platforms.

### Step 3: Created Core Router Factory

**`core-router.ts`** — `createCoreRouter(deps: CoreRouterDeps)` composes all 6 routers:
```ts
createCoreRouter(deps) → router({
  billing, settings, profile, pageContext, org, fleet?
})
```
Fleet is optional (holyship doesn't use it).

### Step 4: Added Repos to PlatformContainer

Updated `core/platform-core/src/server/container.ts`:

**New interface fields on `PlatformContainer`:**
- `authUserRepo: IAuthUserRepository`
- `meterAggregator: IMeterAggregator | null`
- `autoTopupSettingsRepo: IAutoTopupSettingsRepository | null`
- `dividendRepo: IDividendRepository | null`
- `spendingLimitsRepo: ISpendingLimitsRepository | null`
- `affiliateRepo: IAffiliateRepository | null`
- `notificationPrefsRepo: INotificationPreferencesRepository | null`
- `pageContextRepo: IPageContextRepository | null`
- `priceMap: CreditPriceMap | null`
- `processor: IPaymentProcessor | null`
- `tenantCustomerRepo: ITenantCustomerRepository | null`

**New construction in `buildContainer()`** (step 7a):
- `DrizzleMeterAggregator` (wraps `DrizzleUsageSummaryRepository`)
- `DrizzleAutoTopupSettingsRepository`
- `DrizzleSpendingLimitsRepository`
- `DrizzleDividendRepository`
- `DrizzleAffiliateRepository`
- `DrizzleNotificationPreferencesStore`
- `DrizzlePageContextRepository`
- Stripe-derived: `loadCreditPriceMap()`, `processor`, `tenantCustomerRepo`

### Step 5: Updated Exports

Updated `core/platform-core/src/trpc/index.ts` to export:
- `createSettingsRouter`, `createProfileRouter`, `createPageContextRouter` (new factory functions)
- `createBillingRouter`, `BillingRouterDeps` (new)
- `createOrgRouter`, `OrgRouterDeps` (new)
- `createFleetCoreRouter`, `FleetCoreRouterDeps` (new)
- `createCoreRouter`, `CoreRouterDeps` (new)

---

## Design Decisions

### DI Pattern: Function Parameters, Not Singletons
All new routers use `createXxxRouter(deps: XxxDeps)` — deps are passed as a parameter, not via `set*Deps()` singletons. Existing singletons kept for backwards compat.

### Product-Specific Logic as Callbacks
- **Org router**: `onMemberChanged` callback replaces Paperclip's `MemberProvisionClient` + `resolveOrgInstances`. Each product provides its own sync logic.
- **Billing router**: `assertOrgAdminOrOwner` is a callback dep, not imported from platform-specific `auth-helpers.ts`.
- **Fleet-core**: `getFleetForInstance` is injected — each product resolves fleet managers differently (Paperclip has NodeRegistry, WOPR has distributed nodes).

### Fleet Split
- `fleet-core.ts`: 11 shared procedures (read, control, logs, health, metrics, templates)
- `createInstance` stays in each platform (heavy product-specific provisioning logic)
- WOPR's 14 extra procedures (DHT, GPU, node management) stay in wopr-platform

---

## Files Created/Modified

### New Files
- `core/platform-core/src/trpc/routers/billing.ts`
- `core/platform-core/src/trpc/routers/org.ts`
- `core/platform-core/src/trpc/routers/fleet-core.ts`
- `core/platform-core/src/trpc/routers/core-router.ts`

### Modified Files
- `core/platform-core/src/trpc/routers/settings.ts` — added `createSettingsRouter` factory
- `core/platform-core/src/trpc/routers/profile.ts` — added `createProfileRouter` factory
- `core/platform-core/src/trpc/routers/page-context.ts` — added `createPageContextRouter` factory
- `core/platform-core/src/trpc/index.ts` — added exports for all new factories/types
- `core/platform-core/src/server/container.ts` — added billing/monetization repos to interface + buildContainer

### NOT Modified (deliberately)
- Platform copies of routers (paperclip, nemoclaw, wopr, holyship) — deletion comes later
- Platform `index.ts` files — wiring comes in task 6

---

## Build Verification

`npx tsc --noEmit -p core/platform-core/tsconfig.json` — no new structural errors. All errors in my files are pre-existing type resolution issues (missing `@trpc/server`, `zod`, `@types/node` in the worktree), identical to errors in the existing core router files.
