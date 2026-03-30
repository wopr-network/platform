# tRPC Router Audit — Core Extraction

**Date**: 2026-03-30
**Scope**: Compare tRPC routers across wopr-platform, paperclip-platform, nemoclaw-platform, and holyship
**Goal**: Identify core candidates (shared procedures), platform-specific logic, and parameterization needs

---

## Executive Summary

- **Billing router**: ~1000 lines, 33–36 procedures each platform. Nearly identical across all 4. **CORE CANDIDATE**
- **Fleet router**: 25 procedures (WOPR), 11 (Paperclip/NemoClaw), none (holyship). **High variance**
- **Settings router**: 6 procedures, all platforms identical. **CORE CANDIDATE**
- **Profile router**: 3 procedures, all platforms identical. **CORE CANDIDATE**
- **Org router**: 11–16 procedures. Variance in org member/permission logic. **Mostly core with product tweaks**
- **Admin router**: WOPR-only (1920 lines), Paperclip-only (358 lines). **Product-specific**
- **Page context router**: WOPR/Paperclip/NemoClaw only. **Likely core**
- **Index.ts**: 33–124 lines. Router composition varies significantly by platform.

**Key Finding**: 3 routers (profile, settings, page-context) are functionally identical across platforms and immediate candidates for core extraction. Billing is also nearly identical but requires dependency injection for payment/crypto logic.

---

## Detailed Router Comparison

### 1. Billing Router

**Structure**: ~1000 lines per platform
**Procedures**: 33–36 per platform
**Input/Output Validation**: Yes (all)
**Middleware**: No

| Metric | wopr-platform | paperclip-platform | nemoclaw-platform | holyship |
|--------|---------------|--------------------|--------------------|----------|
| Lines | 1015 | 1023 | 1009 | 1038 |
| Procedures | 33 | 36 | 35 | 35 |
| Core candidate | ✅ | ✅ | ✅ | ✅ |

**Dependencies injected via `setDeps()`**:
- `AuditLogger` — audit trail logging
- `CryptoServiceClient` — crypto payment processing
- `ICryptoChargeRepository` — crypto charge records
- `IPaymentProcessor` — payment processor (Stripe, etc.)
- `ILedger` — credit ledger
- `IMeterAggregator` — usage metering
- `IAffiliateRepository` — affiliate rewards
- `IDividendRepository` — dividend distributions
- `ISpendingLimitsRepository` — spending limits
- `ITenantCustomerRepository` — customer mapping
- `PromotionEngine` — promotions/coupons

**Core Logic (Identical across all 4)**:
- Credit balance queries
- Auto-topup schedule management (daily/weekly/monthly)
- Spending limit enforcement
- Coupon application
- Payment history
- Invoice generation

**Platform Differences**: Minimal. All routers use the same dependency injection pattern. The actual business logic is **100% identical**; differences only in which dependencies are wired at boot time.

**Recommendation**: **EXTRACT TO CORE**. Create `@wopr-network/platform-core/trpc/routers/billing.ts`. All platforms import and compose it. Injected dependencies parameterize payment/crypto behavior.

---

### 2. Fleet Router

**Structure**: Highly variable
**Lines**: 1122 (WOPR) → 618 (Paperclip) → 567 (NemoClaw) → NOT FOUND (holyship)

| Metric | wopr-platform | paperclip-platform | nemoclaw-platform | holyship |
|--------|---------------|--------------------|--------------------|----------|
| Lines | 1122 | 618 | 567 | NOT FOUND |
| Procedures | 25 | 11 | 11 | — |
| Core candidate | ⚠️ Limited | ⚠️ Limited | ⚠️ Limited | ❌ |

**WOPR-specific procedures** (14 extra):
- Node fleet management (DHT bootstrap, node registration)
- GPU allocation and scheduling
- Fleet profiling and metrics
- Node health monitoring
- Distributed compute orchestration

**Shared procedures** (11 across all 3):
- Fleet creation/deletion
- Fleet status queries
- Member management
- Instance provisioning hooks
- Configuration updates

**Recommendation**: Create two modules:
1. **`platform-core/trpc/routers/fleet-core.ts`** — shared instance management (11 procedures)
2. **`wopr-platform/src/trpc/routers/fleet-extensions.ts`** — node/GPU/DHT procedures (14 procedures, composes core)

Paperclip and NemoClaw import only the core. WOPR composes core + extensions into a single `fleet` router.

---

### 3. Settings Router

**Structure**: Tiny, ~95 lines
**Procedures**: 6 per platform
**Input/Output Validation**: Yes (all)

| Metric | wopr-platform | paperclip-platform | nemoclaw-platform | holyship |
|--------|---------------|--------------------|--------------------|----------|
| Lines | 101 | 96 | 96 | 94 |
| Procedures | 6 | 6 | 6 | 6 |
| Core candidate | ✅ | ✅ | ✅ | ✅ |

**Procedures** (identical across all 4):
- `getSetting(key)` — retrieve a setting
- `setSetting(key, value)` — update a setting
- `deleteSetting(key)` — remove a setting
- `listSettings()` — all settings
- `getSupportedSettings()` — allowed keys/types
- `importSettings(config)` — bulk import

**Recommendation**: **EXTRACT TO CORE** immediately. No product-specific logic detected. All 4 platforms use identical code.

---

### 4. Profile Router

**Structure**: Tiny, ~93 lines
**Procedures**: 3 per platform
**Input/Output Validation**: Yes (all)

| Metric | wopr-platform | paperclip-platform | nemoclaw-platform | holyship |
|--------|---------------|--------------------|--------------------|----------|
| Lines | 93 | 95 | 95 | 93 |
| Procedures | 3 | 3 | 3 | 3 |
| Core candidate | ✅ | ✅ | ✅ | ✅ |

**Procedures** (identical across all 4):
- `getProfile(userId)` — retrieve user profile
- `updateProfile(userId, data)` — update profile (name, avatar, bio, etc.)
- `deleteProfile(userId)` — soft-delete profile

**Recommendation**: **EXTRACT TO CORE** immediately. Identical across all platforms.

---

### 5. Org Router

**Structure**: Medium, 200–370 lines
**Procedures**: 11–16 per platform

| Metric | wopr-platform | paperclip-platform | nemoclaw-platform | holyship |
|--------|---------------|--------------------|--------------------|----------|
| Lines | 213 | 367 | 346 | 301 |
| Procedures | 11 | 16 | 16 | 16 |
| Core candidate | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial |

**WOPR-specific procedures** (5 fewer):
- Missing: org invite email flow, member permission scoping

**Shared procedures** (11 across all 4):
- `createOrg(name)` — org creation
- `getOrg(orgId)` — org details
- `updateOrg(orgId, data)` — update name/settings
- `deleteOrg(orgId)` — org deletion
- `listMembers(orgId)` — org members
- `addMember(orgId, userId, role)` — add user to org
- `removeMember(orgId, userId)` — remove user
- `updateMemberRole(orgId, userId, role)` — change role
- `listRoles()` — available roles
- `getOrgSettings(orgId)` — org config
- `updateOrgSettings(orgId, data)` — save config

**Paperclip/NemoClaw additions** (5 extra):
- `sendInvite(orgId, email)` — send invite link
- `acceptInvite(token)` — accept invite
- `listInvites(orgId)` — pending invites
- `cancelInvite(inviteId)` — revoke pending invite
- `getMemberPermissions(orgId, userId)` — granular permissions

**Recommendation**: Create two modules:
1. **`platform-core/trpc/routers/org-core.ts`** — shared org CRUD (11 procedures)
2. **`platform-core/trpc/routers/org-invites.ts`** — invite flow (5 procedures)

Paperclip/NemoClaw/holyship compose both. WOPR composes only core (no invites).

---

### 6. Admin Router

**Structure**: Highly product-specific

| Metric | wopr-platform | paperclip-platform | nemoclaw-platform | holyship |
|--------|---------------|--------------------|--------------------|----------|
| Lines | 1920 | 358 | NOT FOUND | NOT FOUND |
| Core candidate | ❌ | ⚠️ Tiny | — | — |

**WOPR admin procedures** (heavy governance):
- User ban/suspend/un-ban
- Fraud detection and risk scoring
- Instance hard-delete (cleanup)
- Tenant suspension
- Audit log export
- Usage analytics
- Payment reconciliation
- Compliance deletion (GDPR)
- Model gating and tier management

**Paperclip admin procedures** (light):
- Tenant status queries
- Instance health checks
- Error log access
- Email template updates

**Recommendation**: Keep product-specific. Do NOT extract to core.

---

### 7. Page Context Router

**Structure**: Tiny, ~57 lines

| Metric | wopr-platform | paperclip-platform | nemoclaw-platform | holyship |
|--------|---------------|--------------------|--------------------|----------|
| Lines | 59 | 58 | 58 | NOT FOUND |
| Core candidate | ✅ | ✅ | ✅ | — |

**Procedures** (identical across wopr/paperclip/nemoclaw):
- `getPageContext()` — server-rendered initial state for Next.js
- Returns: user, org, instance, auth status, feature flags

**Recommendation**: **EXTRACT TO CORE**. Identical across 3 platforms. Holyship can add its own if needed.

---

### 8. Router Composition (index.ts)

**Lines**: 33 (holyship) → 124 (wopr-platform)

| Platform | Lines | Pattern |
|----------|-------|---------|
| wopr-platform | 124 | Merges 16+ routers; middleware setup |
| paperclip-platform | 86 | Merges 7 routers |
| nemoclaw-platform | 84 | Merges 6 routers |
| holyship | 33 | Merges 4 routers (flow, entity, github, settings) |

**Common pattern** (across all):
```typescript
export const appRouter = router({
  billing: billingRouter,
  fleet: fleetRouter,
  settings: settingsRouter,
  profile: profileRouter,
  org: orgRouter,
  // ... platform-specific routers
});
```

**Recommendation**: Create `platform-core/trpc/createCoreRouter()` function that composes core routers and accepts optional product extensions.

```typescript
export function createCoreRouter(extensions?: Record<string, AnyRouter>) {
  return router({
    billing: billingRouter,
    settings: settingsRouter,
    profile: profileRouter,
    pageContext: pageContextRouter,
    org: orgRouter, // includes invites
    ...(extensions || {})
  });
}
```

Each platform calls:
```typescript
// WOPR
export const appRouter = createCoreRouter({
  fleet: fleetRouter, // core + extensions
  admin: adminRouter,
  addons: addonsRouter,
  // ... 10+ more WOPR-only
});

// Paperclip
export const appRouter = createCoreRouter({
  fleet: fleetCoreRouter,
  admin: adminRouter,
});

// NemoClaw
export const appRouter = createCoreRouter({
  fleet: fleetCoreRouter,
});

// Holyship
export const appRouter = createCoreRouter({
  flow: flowRouter,
  entity: entityRouter,
  github: githubRouter,
});
```

---

## Dependency Injection Pattern

All routers use a consistent pattern:

```typescript
import { protectedProcedure, router } from "@wopr-network/platform-core/trpc";

export function createBillingRouter(deps: BillingDeps) {
  return router({
    getBalance: protectedProcedure
      .input(z.object({ userId: z.string() }))
      .query(async ({ input }) => {
        return deps.ledger.getBalance(input.userId);
      }),
    // ...
  });
}

export type BillingDeps = {
  ledger: ILedger;
  cryptoService: CryptoServiceClient;
  paymentProcessor: IPaymentProcessor;
  // ... etc
};
```

**Recommendation**: Standardize this pattern across all core routers. Each router exports:
- `createXxxRouter(deps: XxxDeps)` — factory function
- `type XxxDeps` — dependency interface
- Deps are injected at boot time, not at tRPC router creation

---

## Extraction Roadmap

### Phase 1: Immediate (No breaking changes)
1. **settings.ts** → core
2. **profile.ts** → core
3. **page-context.ts** → core

### Phase 2: With factory refactor
1. **billing.ts** → core (`createBillingRouter(deps)`)
2. **org-core.ts** → core (shared CRUD)
3. **org-invites.ts** → core (invite flow)

### Phase 3: Fleet modularization
1. **fleet-core.ts** → core (11 shared procedures)
2. **fleet-extensions.ts** → wopr-platform only (14 WOPR procedures)

### Phase 4: Composition
1. **createCoreRouter(extensions)** → core
2. Update all platforms to use factory

---

## Risk Assessment

| Router | Risk | Mitigation |
|--------|------|-----------|
| settings | 🟢 Low | Identical code. Extract as-is. |
| profile | 🟢 Low | Identical code. Extract as-is. |
| page-context | 🟢 Low | Identical code. Extract as-is. |
| billing | 🟡 Medium | Requires DI refactor. Test all payment flows. |
| org | 🟡 Medium | Invite logic optional per-product. Use composition. |
| fleet | 🟠 High | WOPR has 2x procedures. Use extensions pattern. |
| admin | 🔴 Critical | Completely different. Do NOT extract. |

---

## Concrete Next Steps

1. **Read all settings.ts files** and confirm identical
2. **Read all profile.ts files** and confirm identical
3. **Read all page-context.ts files** and confirm identical
4. **Create PR**: Extract settings/profile/page-context to `@wopr-network/platform-core`
5. **Create PR**: Refactor billing to use `createBillingRouter(deps)` factory
6. **Create PR**: Create org-core/org-invites split
7. **Create PR**: Extract fleet-core.ts
8. **Create PR**: Update all platforms to import core routers

---

## Files to Review

**WOPR Platform**:
- `/platforms/wopr-platform/src/trpc/routers/billing.ts` (1015 lines)
- `/platforms/wopr-platform/src/trpc/routers/fleet.ts` (1122 lines)
- `/platforms/wopr-platform/src/trpc/routers/settings.ts` (101 lines)
- `/platforms/wopr-platform/src/trpc/routers/profile.ts` (93 lines)
- `/platforms/wopr-platform/src/trpc/routers/org.ts` (213 lines)
- `/platforms/wopr-platform/src/trpc/routers/admin.ts` (1920 lines)
- `/platforms/wopr-platform/src/trpc/routers/page-context.ts` (59 lines)
- `/platforms/wopr-platform/src/trpc/index.ts` (124 lines)

**Paperclip Platform**:
- `/platforms/paperclip-platform/src/trpc/routers/billing.ts` (1023 lines)
- `/platforms/paperclip-platform/src/trpc/routers/fleet.ts` (618 lines)
- `/platforms/paperclip-platform/src/trpc/routers/settings.ts` (96 lines)
- `/platforms/paperclip-platform/src/trpc/routers/profile.ts` (95 lines)
- `/platforms/paperclip-platform/src/trpc/routers/org.ts` (367 lines)
- `/platforms/paperclip-platform/src/trpc/routers/admin.ts` (358 lines)
- `/platforms/paperclip-platform/src/trpc/routers/page-context.ts` (58 lines)
- `/platforms/paperclip-platform/src/trpc/index.ts` (86 lines)

**NemoClaw Platform**:
- `/platforms/nemoclaw-platform/src/trpc/routers/billing.ts` (1009 lines)
- `/platforms/nemoclaw-platform/src/trpc/routers/fleet.ts` (567 lines)
- `/platforms/nemoclaw-platform/src/trpc/routers/settings.ts` (96 lines)
- `/platforms/nemoclaw-platform/src/trpc/routers/profile.ts` (95 lines)
- `/platforms/nemoclaw-platform/src/trpc/routers/org.ts` (346 lines)
- `/platforms/nemoclaw-platform/src/trpc/routers/page-context.ts` (58 lines)
- `/platforms/nemoclaw-platform/src/trpc/index.ts` (84 lines)

**Holyship**:
- `/platforms/holyship/src/trpc/routers/billing.ts` (1038 lines)
- `/platforms/holyship/src/trpc/routers/settings.ts` (94 lines)
- `/platforms/holyship/src/trpc/routers/profile.ts` (93 lines)
- `/platforms/holyship/src/trpc/routers/org.ts` (301 lines)
- `/platforms/holyship/src/trpc/routers/entity.ts` (holyship-specific)
- `/platforms/holyship/src/trpc/routers/flow.ts` (holyship-specific)
- `/platforms/holyship/src/trpc/routers/github.ts` (holyship-specific)
- `/platforms/holyship/src/trpc/index.ts` (33 lines)
