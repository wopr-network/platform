# Admin Router Extraction Audit

**Complete audit of admin tRPC routers across WOPR and Paperclip platforms for extraction into platform-core.**

---

## Quick Summary

| Metric | Value |
|--------|-------|
| Total WOPR admin procedures | 67 |
| Extractable to platform-core | 45 (67%) |
| WOPR-specific (keep local) | 22 (33%) |
| Paperclip admin procedures | 6 (completely disjoint) |
| Overlap between products | None |

### Breakdown

- **🟢 CORE** (25/67): Pure generic, zero WOPR dependencies. Ready to extract immediately.
  - Audit, credits, users, tenant status, notifications, billing, compliance
- **🟡 SEMI-CORE** (20/67): Generic concepts, WOPR-specific storage. Extractable after store abstraction.
  - Notes, analytics, bulk operations
- **🔵 WOPR-SPECIFIC** (22/67): Product-specific features. Stay in wopr-platform.
  - Rates, GPU management, affiliate fraud, snapshot restore, usage by capability

---

## Documents in This Audit

### 1. **audit-admin-router.md** (Main Report)
Complete audit with:
- Executive summary
- Categorization of all 67 procedures (CORE/SEMI-CORE/WOPR-SPECIFIC)
- Dependency analysis (16 platform-core imports + 7 local imports)
- Product filtering analysis (no X-Product header, tenant-scoped)
- Extraction roadmap (3 phases)
- Risk assessment
- Comparison with Paperclip admin router

**Read this first** for strategy and context.

### 2. **procedure-details.md** (Reference)
Line-by-line breakdown of all 67 procedures:
- Name, type (query/mutation), input/output, dependencies
- Grouped by category (audit, credits, users, etc.)
- Auth & validation rules
- Implementation notes (pagination, date ranges, audit logging, error handling)

**Use this for implementation** — copy procedures from here.

### 3. **EXTRACTION_STRATEGY.md** (Implementation Plan)
Step-by-step execution plan across 4 phases:
- Phase 1 (4-6h): Move 25 CORE procedures to platform-core
- Phase 2 (8-12h): Abstract stores + move 20 SEMI-CORE procedures
- Phase 3 (2-4h): Keep 22 WOPR-specific in wopr-platform
- Phase 4 (4-6h): Validate Paperclip integration, cross-product tests

**Use this to execute** — follow the checklist and steps.

---

## Key Findings

### ✅ No X-Product Filtering Required
- All procedures assume caller is authenticated `platform_admin`
- All tenant operations accept `tenantId` as input parameter
- Multi-tenant ready (no implicit tenant from ctx)

### ✅ Platform-Core Already Provides 70% of Dependencies
- AdminAuditLog, RoleStore, ILedger, Credit, IAutoTopupSettingsRepository
- NotificationService, INotificationQueueRepository
- MetricsCollector, AlertChecker, SystemResourceMonitor
- RestoreService, IRestoreLogStore
- ITenantStatusRepository, IAccountExportStore, IAccountDeletionStore

### ❌ 4 Stores Need Abstraction (SEMI-CORE)
These are currently local to wopr-platform but generic enough for platform-core:
1. **AdminUserStore** — used by 2 procedures (usersList, usersGet)
2. **AnalyticsStore** — used by 10 procedures (revenue, margins, tenant health, time series)
3. **IBulkOperationsStore** — used by 7 procedures (bulk grant, suspend, etc.)
4. **IAdminNotesRepository** — used by 4 procedures (notes CRUD)

**Action**: Move interfaces to platform-core, keep implementations in wopr-platform (DI pattern).

### ❌ 4 Procedures Are Truly WOPR-Only (GPU Management)
- `gpuAllocations`, `updateGpuAllocation`, `gpuConfigurations`, `updateGpuConfiguration`

These depend on `IGpuAllocationRepository` and `IGpuConfigurationRepository` which encode WOPR's GPU fleet model. Cannot be generalized.

### 📊 Paperclip is Completely Independent
- 6 procedures, zero overlap with WOPR
- Operates on different concepts (gateway models, instances, orgs)
- Can safely import generic core admin router without conflicts

---

## Implementation Roadmap

### Immediate (Phase 1) — 1 day
1. Create `platform-core/src/trpc/routers/admin.ts`
2. Copy 25 CORE procedures from wopr-platform
3. Move AdminRouterDeps interface to platform-core
4. Update wopr-platform to re-export and extend core router
5. Run tests ✅

### Short-term (Phase 2) — 2-3 days
6. Create abstract store interfaces in platform-core
7. Move 20 SEMI-CORE procedures to platform-core
8. Update wopr-platform DI to provide concrete implementations
9. Run tests ✅

### Medium-term (Phase 3-4) — 1-2 days
10. Integrate Paperclip admin router with core router
11. Cross-product validation tests
12. Deploy with feature flag (optional)

**Total**: ~1 week of focused work

---

## Critical Dependencies

### Must be in platform-core (already there)
```
AdminAuditLog, RoleStore, ILedger, Credit
NotificationService, INotificationQueueRepository
ITenantStatusRepository
MetricsCollector, AlertChecker, SystemResourceMonitor
IAccountExportStore, IAccountDeletionStore
```

### Must be created in platform-core (as interfaces)
```
IAdminNotesRepository
AnalyticsStore
IBulkOperationsStore
AdminUserStore (or pull from wherever it's defined)
```

### Must stay in wopr-platform
```
RateStore (WOPR rates model)
IGpuAllocationRepository (GPU fleet)
IGpuConfigurationRepository (GPU hardware)
IAffiliateFraudAdminRepository (WOPR affiliate model)
```

---

## Validation Checklist

- [ ] All 25 CORE procedures copied to platform-core without modification
- [ ] AdminRouterDeps interface compiles in platform-core
- [ ] wopr-platform admin router re-exports core router
- [ ] All 67 procedures remain accessible via wopr-platform admin router (no breaking change)
- [ ] WOPR admin router tests pass
- [ ] Platform-core admin router tests pass
- [ ] Paperclip admin router imports core router successfully
- [ ] No import cycles between platform-core and products
- [ ] Type safety verified with `tsc --noEmit`
- [ ] Lint passes: `pnpm lint`
- [ ] Full test suite passes: `pnpm test`

---

## Notes for Future Maintainers

### Why Not All Generic?
Rates (9 procedures) encode WOPR's specific marketplace model (sell rates to customers, provider rates to suppliers). Paperclip doesn't have this. Similarly, GPU procedures are WOPR-specific because no other product (yet) manages GPU resources.

### Why Abstract Stores?
AdminUserStore, AnalyticsStore, etc. are implemented locally in wopr-platform but their interfaces are generic enough to work across products. By abstracting them to platform-core interfaces, we allow:
1. Paperclip (and future products) to reuse the procedures
2. Different implementations per product (wopr analytics ≠ paperclip analytics)
3. DI (dependency injection) to wire concrete impls at boot time

### Why No X-Product Header?
Procedures operate at the **platform admin level**, not tenant level. Tenant filtering happens at the input parameter level (tenantId in input), not HTTP header level. This keeps admin routers simple and multi-tenant safe.

---

## References

- **Main audit**: `docs/audit-admin-router.md`
- **Procedure reference**: `docs/procedure-details.md`
- **Extraction plan**: `docs/EXTRACTION_STRATEGY.md`
- **Source**: `/home/tsavo/platform/platforms/wopr-platform/src/trpc/routers/admin.ts` (1,919 lines, 67 procedures)

---

## Questions?

See `docs/audit-admin-router.md` for detailed risk assessment, or `docs/EXTRACTION_STRATEGY.md` for step-by-step execution.

---

**Audit completed**: 2026-03-30
**Status**: Ready for Phase 1 implementation
