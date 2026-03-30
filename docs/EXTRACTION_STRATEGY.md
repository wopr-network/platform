# Admin Router Extraction Strategy

**Goal**: Move 45 generic admin procedures from wopr-platform to platform-core, while keeping 22 WOPR-specific procedures in place.

---

## Phase Overview

| Phase | Procedures | Risk | Effort | Duration |
|-------|-----------|------|--------|----------|
| 1: Pure CORE | 25 (audit, credits, users, tenant, notifications, billing, compliance) | Low | 4-6h | 1 day |
| 2: Store Abstraction | 20 (notes, analytics, bulk) | Medium | 8-12h | 2-3 days |
| 3: WOPR Integration | Rates, GPU, affiliate, restore | Low | 2-4h | 0.5 day |
| 4: Rollout & Testing | Cross-product validation, Paperclip integration | Medium | 4-6h | 1 day |

---

## Phase 1: Pure CORE (25 Procedures) — 4-6 Hours

### Step 1a: Create platform-core admin router skeleton

**File**: `packages/platform-core/src/trpc/routers/admin.ts`

```typescript
import { router, adminProcedure } from "@wopr-network/platform-core/trpc";
import type { AdminAuditLog, RoleStore } from "@wopr-network/platform-core/admin";
import type { ILedger } from "@wopr-network/platform-core/credits";
import { z } from "zod";

// AdminRouterDeps interface (same as wopr-platform)
export interface AdminCoreRouterDeps {
  getAuditLog: () => AdminAuditLog;
  getCreditLedger: () => ILedger;
  getUserStore: () => AdminUserStore;  // ← Will become optional in next phase
  getTenantStatusStore: () => ITenantStatusRepository;
  getNotificationService?: () => NotificationService;
  getNotificationQueueStore?: () => INotificationQueueRepository;
  // ... (26 more optional deps)
}

let _deps: AdminCoreRouterDeps | null = null;

export function setAdminCoreRouterDeps(deps: AdminCoreRouterDeps): void {
  _deps = deps;
}

function deps(): AdminCoreRouterDeps {
  if (!_deps) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Admin core not initialized" });
  return _deps;
}

export const adminCoreRouter = router({
  // Copy 25 pure CORE procedures from wopr-platform/admin.ts here
  // ...
});
```

### Step 1b: Copy procedures (25 total)

1. **Audit** (2): auditLog, auditLogExport
2. **Credits** (6): creditsBalance, creditsGrant, creditsRefund, creditsCorrection, creditsTransactions, creditsTransactionsExport
3. **Users** (2): usersList, usersGet
4. **Tenant Status** (5): tenantStatus, suspendTenant, reactivateTenant, banTenant, tenantChangeRole, tenantDetail
5. **Notifications** (3): notificationSend, notificationSendCustom, notificationLog
6. **Billing** (1): billingHealth
7. **Compliance** (5): complianceExportRequests, complianceTriggerExport, complianceDeletionRequests, complianceTriggerDeletion, complianceCancelDeletion

### Step 1c: Update wopr-platform admin.ts

```typescript
import { adminCoreRouter, setAdminCoreRouterDeps } from "@wopr-network/platform-core/trpc";

// Re-export core router
export { adminCoreRouter };

// Extend with WOPR-specific procedures
export const adminRouter = router({
  // Re-nest core router
  ...adminCoreRouter._def.procedures,

  // Add WOPR-specific (22 procedures)
  rates: { /* ... */ },
  gpu: { /* ... */ },
  affiliate: { /* ... */ },
  // ...
});
```

**Alternative**: Export both routers separately and let caller compose:

```typescript
export const adminRouter = mergeRouters(
  adminCoreRouter,
  woprSpecificAdminRouter
);
```

### Step 1d: Tests

- Copy `platform-core/src/trpc/routers/admin.test.ts` from wopr-platform tests
- Update imports to use new path
- Run: `pnpm test -- admin.test.ts`

---

## Phase 2: Store Abstraction (20 Procedures) — 8-12 Hours

### Step 2a: Create abstract store interfaces in platform-core

**Files to create**:

```
packages/platform-core/src/admin/
├── notes/
│   └── admin-notes-repository.ts      (interface)
├── analytics/
│   └── analytics-store.ts             (interface)
├── bulk/
│   └── bulk-operations-store.ts       (interface)
└── users/
    └── user-store.ts                  (interface + abstract base)
```

Example for `admin-notes-repository.ts`:

```typescript
export interface IAdminNotesRepository {
  list(tenantId?: string, limit?: number, offset?: number): Promise<{ notes: AdminNote[], total: number }>;
  create(tenantId: string, title: string, body: string, tags?: string[]): Promise<AdminNote>;
  update(noteId: string, title?: string, body?: string, tags?: string[]): Promise<AdminNote>;
  delete(noteId: string): Promise<void>;
}

export interface AdminNote {
  id: string;
  tenantId?: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Step 2b: Move procedures to platform-core

Move to `platform-core/src/trpc/routers/admin-extensions.ts` or nest under main router:

1. **Notes** (4): notesList, notesCreate, notesUpdate, notesDelete
2. **Analytics** (9): analyticsRevenue, analyticsFloat, analyticsRevenueBreakdown, analyticsMarginByCapability, analyticsProviderSpend, analyticsTenantHealth, analyticsAutoTopup, analyticsTimeSeries, analyticsExport
3. **Bulk** (7): bulkSelectAll, bulkDryRun, bulkGrant, bulkGrantUndo, bulkSuspend, bulkReactivate, bulkExport

### Step 2c: Update AdminCoreRouterDeps

```typescript
export interface AdminCoreRouterDeps {
  // ... Phase 1 deps

  // New in Phase 2
  getNotesStore?: () => IAdminNotesRepository;
  getAnalyticsStore?: () => AnalyticsStore;
  getBulkStore?: () => IBulkOperationsStore;
  getUserStore: () => AdminUserStore;  // Keep in Phase 1
}
```

### Step 2d: Update wopr-platform

Provide concrete implementations:

```typescript
import { setAdminCoreRouterDeps } from "@wopr-network/platform-core/trpc";

setAdminCoreRouterDeps({
  getAuditLog: () => container.get(AdminAuditLog),
  getCreditLedger: () => container.get(CreditLedger),
  getUserStore: () => container.get(AdminUserStore),
  getNotesStore: () => container.get(AdminNotesRepository),
  getAnalyticsStore: () => container.get(AnalyticsStore),
  getBulkStore: () => container.get(BulkOperationsStore),
  // ... more
});
```

---

## Phase 3: WOPR Integration (22 Procedures) — 2-4 Hours

### Step 3a: Keep WOPR-specific procedures in wopr-platform

```typescript
// wopr-platform/src/trpc/routers/admin.ts

import { adminCoreRouter, setAdminCoreRouterDeps } from "@wopr-network/platform-core/trpc";

export const adminRouter = router({
  // Re-export core
  ...adminCoreRouter._def.procedures,

  // WOPR-specific (9 rate procedures)
  ratesListSell: adminProcedure /* ... */,
  ratesCreateSell: adminProcedure /* ... */,
  // ... (7 more)

  // WOPR-specific (4 GPU procedures)
  gpuAllocations: adminProcedure /* ... */,
  updateGpuAllocation: adminProcedure /* ... */,
  // ... (2 more)

  // WOPR-specific (4 affiliate procedures)
  affiliateSuppressions: adminProcedure /* ... */,
  // ... (3 more)

  // WOPR-specific (3 restore procedures)
  restoreListSnapshots: adminProcedure /* ... */,
  // ... (2 more)

  // WOPR-specific (1 usage procedure)
  tenantUsageByCapability: adminProcedure /* ... */,
});
```

### Step 3b: Optional: Create separate admin-wopr.ts

For clarity, separate WOPR-specific procedures:

```typescript
// wopr-platform/src/trpc/routers/admin-wopr.ts
export const adminWoprRouter = router({
  rates: { /* 9 procedures */ },
  gpu: { /* 4 procedures */ },
  affiliate: { /* 4 procedures */ },
  restore: { /* 3 procedures */ },
  // ...
});

// wopr-platform/src/trpc/routers/admin.ts
export const adminRouter = mergeRouters(
  adminCoreRouter,
  adminWoprRouter
);
```

---

## Phase 4: Rollout & Testing — 4-6 Hours

### Step 4a: Update tests

- ✅ Ensure `admin.test.ts` passes for core procedures
- ✅ Add WOPR-specific admin tests in wopr-platform
- ✅ Run full test suite: `pnpm test`

### Step 4b: Validate Paperclip can import core

```typescript
// paperclip-platform/src/trpc/routers/admin.ts

import { adminCoreRouter, setAdminCoreRouterDeps } from "@wopr-network/platform-core/trpc";

export const adminRouter = router({
  // Re-export core
  ...adminCoreRouter._def.procedures,

  // Paperclip-specific
  getGatewayModel: adminProcedure /* ... */,
  setGatewayModel: adminProcedure /* ... */,
  // ... (4 more)
});

// In boot/init:
setAdminCoreRouterDeps({
  getAuditLog: () => container.get(AdminAuditLog),
  // ... (provide Paperclip's concrete implementations)
});
```

### Step 4c: Integration test

```bash
# Ensure WOPR admin router still works
pnpm test -- platforms/wopr-platform/src/trpc/routers/admin.test.ts

# Ensure platform-core admin router loads
pnpm test -- packages/platform-core/src/trpc/routers/admin.test.ts

# Run full suite
pnpm test
pnpm lint
pnpm build
```

### Step 4d: Deploy with feature flag (optional)

If you want to roll out safely:

```typescript
const USE_CORE_ADMIN = process.env.USE_CORE_ADMIN === "true";

export const adminRouter = USE_CORE_ADMIN
  ? mergeRouters(adminCoreRouter, adminWoprRouter)
  : legacyAdminRouter;
```

Set `USE_CORE_ADMIN=true` in production after validation.

---

## File Checklist

### Create in platform-core
- [ ] `packages/platform-core/src/trpc/routers/admin.ts` (25 CORE procedures)
- [ ] `packages/platform-core/src/trpc/routers/admin-extensions.ts` (20 SEMI-CORE procedures) — OR nest in admin.ts
- [ ] `packages/platform-core/src/admin/notes/admin-notes-repository.ts` (interface)
- [ ] `packages/platform-core/src/admin/analytics/analytics-store.ts` (interface)
- [ ] `packages/platform-core/src/admin/bulk/bulk-operations-store.ts` (interface)
- [ ] `packages/platform-core/src/admin/users/user-store.ts` (interface)
- [ ] `packages/platform-core/src/trpc/routers/admin.test.ts` (copy from wopr-platform)

### Update in wopr-platform
- [ ] `platforms/wopr-platform/src/trpc/routers/admin.ts` — re-export core, add WOPR-specific
- [ ] `platforms/wopr-platform/src/trpc/routers/admin.test.ts` — update imports

### Update in paperclip-platform (Phase 4)
- [ ] `platforms/paperclip-platform/src/trpc/routers/admin.ts` — re-export core, add Paperclip-specific
- [ ] Tests if applicable

### Dependencies to update
- [ ] platform-core `package.json` exports (admin routers)
- [ ] WOPR platform-core version bump

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking WOPR admin API | Run tests before and after each phase. Use feature flag if needed. |
| Circular imports | Use DI (setAdminCoreRouterDeps) instead of direct imports. |
| Store implementations incomplete | Keep local implementations in wopr-platform during Phase 2, just add interfaces to core. |
| Paperclip divergence | Test Paperclip admin router early (Phase 4) to catch incompatibilities. |
| AdminRouterDeps too large | Consider splitting: AdminCoreDeps, AdminNotificationsDeps, AdminAnalyticsDeps, etc. |

---

## Success Criteria

✅ **Phase 1 Complete**: 25 CORE procedures in platform-core, tests pass
✅ **Phase 2 Complete**: 20 SEMI-CORE procedures in platform-core, store interfaces defined
✅ **Phase 3 Complete**: 22 WOPR-specific procedures remain in wopr-platform, no regression
✅ **Phase 4 Complete**: Paperclip imports core router, all tests pass, no breaking changes

---

## Timeline Estimate

- **Total effort**: 18-28 hours of development
- **Recommended**: 3-4 day sprint (break into 1-2h focused sessions)
- **Parallel work**: Phase 2 (store abstraction) can run in parallel with Phase 1 tests
