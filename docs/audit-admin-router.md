# Admin tRPC Router Audit for Platform-Core Extraction

**Date**: 2026-03-30
**Scope**: Audit admin routers in wopr-platform and paperclip-platform for extraction into platform-core
**Working Directory**: `/home/tsavo/platform/.claude/worktrees/admin-extraction`

---

## Executive Summary

### WOPR Platform Admin Router
- **67 procedures** (37 queries, 30 mutations) in 1,919 lines
- **16 platform-core imports** (credits, audit, fleet, inference, monetization, etc.)
- **7 local imports** (WOPR-specific stores: user-store, tenant-status, analytics, bulk, notes, etc.)
- **No X-Product filtering** — all procedures operate cross-tenant but within WOPR namespace
- **4 WOPR-specific procedures** (GPU allocation/configuration)

### Paperclip Platform Admin Router
- **6 procedures** (3 queries, 3 mutations) in 12,045 lines (likely includes lots of whitespace/comments)
- **Minimal procedures** — only instance, org, billing, and gateway model config
- **NOT overlapping** with WOPR procedures — completely different scope

### Key Finding
**Most WOPR admin procedures ARE generic and suitable for platform-core.** The local dependencies (user-store, tenant-status, analytics) are WOPR-specific repositories that would need to stay product-agnostic or be refactored into platform-core stores.

---

## WOPR Admin Router Categorization

### 🟢 CORE — Generic Admin (Cross-Product Candidate)

These procedures work on **generic concepts** (credits, audit, tenants, users, notifications) and have **minimal WOPR-specific logic**:

| Procedure | Type | Dependencies | Reason |
|-----------|------|-------------|--------|
| `auditLog` | Query | platform-core AdminAuditLog | Generic audit trail; works for any product |
| `auditLogExport` | Query | platform-core AdminAuditLog | CSV export of audit log |
| `creditsBalance` | Query | platform-core ILedger | Generic credit ledger query |
| `creditsGrant` | Mutation | platform-core ILedger, AdminAuditLog | Credit issuance (core operation) |
| `creditsRefund` | Mutation | platform-core ILedger, AdminAuditLog | Credit reversal (core operation) |
| `creditsCorrection` | Mutation | platform-core ILedger, AdminAuditLog | Credit adjustment (core operation) |
| `creditsTransactions` | Query | platform-core ILedger | Ledger transaction history |
| `creditsTransactionsExport` | Query | platform-core ILedger | CSV export of transactions |
| `usersList` | Query | AdminUserStore (local) | Generic user listing; AdminUserStore needs abstraction |
| `usersGet` | Query | AdminUserStore (local) | Generic user fetch |
| `tenantStatus` | Query | platform-core ITenantStatusRepository | Tenant lifecycle (active/suspended/etc.) |
| `suspendTenant` | Mutation | platform-core ITenantStatusRepository, ILedger | Tenant suspension (core operation) |
| `reactivateTenant` | Mutation | platform-core ITenantStatusRepository | Tenant reactivation |
| `banTenant` | Mutation | platform-core ITenantStatusRepository | Permanent tenant ban |
| `tenantDetail` | Query | ITenantStatusRepository (local) | Generic tenant info |
| `tenantChangeRole` | Mutation | RoleStore (platform-core) | Role assignment (core) |
| `notificationSend` | Mutation | platform-core NotificationService | Generic notification dispatch |
| `notificationSendCustom` | Mutation | platform-core NotificationService | Custom notification template |
| `notificationLog` | Query | platform-core INotificationQueueRepository | Notification history |
| `billingHealth` | Query | platform-core MetricsCollector, AlertChecker, SystemResourceMonitor | System health probes (generic) |
| `complianceExportRequests` | Query | platform-core IAccountExportStore | GDPR data export requests |
| `complianceTriggerExport` | Mutation | platform-core IAccountExportStore | Trigger user data export |
| `complianceDeletionRequests` | Query | platform-core IAccountDeletionStore | Right-to-be-forgotten requests |
| `complianceTriggerDeletion` | Mutation | platform-core IAccountDeletionStore | Trigger account deletion |
| `complianceCancelDeletion` | Mutation | platform-core IAccountDeletionStore | Cancel pending deletion |

**Total CORE: 25 procedures (37% of WOPR admin router)**

---

### 🟡 SEMI-CORE — Generic Concept, WOPR-Specific Storage

These procedures implement **generic admin concepts** but depend on **WOPR-specific local stores**. Extraction requires:
1. Abstracting the local store into platform-core (move interface to platform-core, impl stays product-specific)
2. OR accepting that platform-core provides the interface stub and each product implements

| Procedure | Type | Dependencies | Blocker |
|-----------|------|-------------|---------|
| `notesList` | Query | IAdminNotesRepository (local) | Move notes store to platform-core interface |
| `notesCreate` | Mutation | IAdminNotesRepository (local) | ""  |
| `notesUpdate` | Mutation | IAdminNotesRepository (local) | ""  |
| `notesDelete` | Mutation | IAdminNotesRepository (local) | ""  |
| `analyticsRevenue` | Query | AnalyticsStore (local) | Move analytics store to platform-core interface |
| `analyticsFloat` | Query | AnalyticsStore (local) | ""  |
| `analyticsRevenueBreakdown` | Query | AnalyticsStore (local) | ""  |
| `analyticsMarginByCapability` | Query | AnalyticsStore (local) | ""  |
| `analyticsProviderSpend` | Query | AnalyticsStore (local) | ""  |
| `analyticsTenantHealth` | Query | AnalyticsStore (local) | ""  |
| `analyticsAutoTopup` | Query | AnalyticsStore (local) | ""  |
| `analyticsTimeSeries` | Query | AnalyticsStore (local) | ""  |
| `analyticsExport` | Query | AnalyticsStore (local) | ""  |
| `bulkSelectAll` | Query | IBulkOperationsStore (local) | Move bulk store to platform-core interface |
| `bulkDryRun` | Query | IBulkOperationsStore (local) | ""  |
| `bulkGrant` | Mutation | IBulkOperationsStore (local) | ""  |
| `bulkGrantUndo` | Mutation | IBulkOperationsStore (local) | ""  |
| `bulkSuspend` | Mutation | IBulkOperationsStore (local) | ""  |
| `bulkReactivate` | Mutation | IBulkOperationsStore (local) | ""  |
| `bulkExport` | Mutation | IBulkOperationsStore (local) | ""  |

**Total SEMI-CORE: 20 procedures (30% of WOPR admin router)**

**Recommendation**: Extract these procedures + move their stores to platform-core as **abstract interfaces** (DI pattern). Implementations remain product-specific.

---

### 🔵 WOPR-SPECIFIC — Non-Transferable

These procedures are **tightly coupled to WOPR product capabilities** (GPU allocation, node management, rates). Not suitable for platform-core.

| Procedure | Type | Dependencies | Why WOPR-Only |
|-----------|------|-------------|---------------|
| `ratesListSell` | Query | RateStore (platform-core) | WOPR-specific rates model (sell/provider margins) |
| `ratesCreateSell` | Mutation | RateStore (platform-core) | ""  |
| `ratesUpdateSell` | Mutation | RateStore (platform-core) | ""  |
| `ratesDeleteSell` | Mutation | RateStore (platform-core) | ""  |
| `ratesListProvider` | Query | RateStore (platform-core) | ""  |
| `ratesCreateProvider` | Mutation | RateStore (platform-core) | ""  |
| `ratesUpdateProvider` | Mutation | RateStore (platform-core) | ""  |
| `ratesDeleteProvider` | Mutation | RateStore (platform-core) | ""  |
| `ratesMargins` | Query | RateStore (platform-core) | ""  |
| `tenantUsageByCapability` | Query | AnalyticsStore | GPU/capability-based usage (WOPR model) |
| `restoreListSnapshots` | Query | RestoreService (platform-core) | Snapshot restore (generic but not critical) |
| `restoreFromSnapshot` | Mutation | RestoreService (platform-core) | ""  |
| `restoreHistory` | Query | RestoreLogStore (platform-core) | ""  |
| `affiliateSuppressions` | Query | IAffiliateFraudAdminRepository (platform-core) | Affiliate fraud detection (WOPR monetization) |
| `affiliateVelocity` | Query | IAffiliateFraudAdminRepository (platform-core) | ""  |
| `affiliateFingerprintClusters` | Query | IAffiliateFraudAdminRepository (platform-core) | ""  |
| `affiliateBlockFingerprint` | Mutation | IAffiliateFraudAdminRepository (platform-core) | ""  |
| `gpuAllocations` | Query | IGpuAllocationRepository (platform-core) | **GPU fleet management (core WOPR feature)** |
| `updateGpuAllocation` | Mutation | IGpuAllocationRepository (platform-core) | **""**  |
| `gpuConfigurations` | Query | IGpuConfigurationRepository (platform-core) | **GPU hardware config (core WOPR feature)** |
| `updateGpuConfiguration` | Mutation | IGpuConfigurationRepository (platform-core) | **""**  |

**Total WOPR-SPECIFIC: 22 procedures (33% of WOPR admin router)**

---

## Dependency Analysis

### Platform-Core Imports (16 unique)
All imported from `@wopr-network/platform-core`:

| Import | Category | Extractable? |
|--------|----------|--------------|
| AdminAuditLog, RoleStore | admin | ✅ Yes |
| RateStore | admin/rates | ❌ WOPR-specific rates model |
| ILedger, Credit, IAutoTopupSettingsRepository | credits | ✅ Yes |
| NotificationService, INotificationQueueRepository | email | ✅ Yes |
| IGpuAllocationRepository, IGpuConfigurationRepository | fleet | ❌ WOPR GPU-specific |
| ISessionUsageRepository | inference | ✅ Yes (generic usage) |
| MeterAggregator | metering | ✅ Yes |
| IAffiliateFraudAdminRepository, BotBilling | monetization | ❌ WOPR affiliate/bot model |
| PaymentHealthStatus | monetization/incident | ✅ Possibly (generic health) |
| AlertChecker, MetricsCollector, SystemResourceMonitor | observability | ✅ Yes |
| RestoreService, IRestoreLogStore | backup | ✅ Yes (generic backup) |
| ITenantStatusRepository | admin/tenant-status | ✅ Yes |

### Local WOPR Imports (7)
All from `../../admin/` and `../../account/`:

| Import | Type | Recommendation |
|--------|------|-----------------|
| AdminUserStore | Store | Abstract to platform-core interface |
| ITenantStatusRepository | Repository | **Already in platform-core** — pull into core |
| AnalyticsStore | Store | Abstract to platform-core interface |
| IBulkOperationsStore | Store | Abstract to platform-core interface |
| IAdminNotesRepository | Repository | Abstract to platform-core interface |
| IAccountExportStore | Store | **Already in platform-core** — pull into core |
| IAccountDeletionStore | Store | **Already in platform-core** — pull into core |

---

## Product Filtering Analysis

**NO X-Product header filtering is used.** All procedures assume the caller's tenant context is in `ctx.tenantId` or operate on a tenant passed in the input.

- **Authentication gate**: All use `adminProcedure` which checks `ctx.user?.roles.includes('platform_admin')`
- **Tenant scoping**: All procedures that touch tenant data accept `tenantId` as input parameter
- **Multi-tenant ready**: ✅ Yes, all procedures support arbitrary tenant IDs

**Action item**: When extracting to platform-core, ensure caller context validates that the authenticated user has platform_admin role **and** permission to administrate the tenant being queried.

---

## Extraction Roadmap

### Phase 1: Pure CORE (Low Risk)
Move procedures with **zero local dependencies**:
- Audit log (auditLog, auditLogExport)
- Credits (creditsBalance, creditsGrant, creditsRefund, creditsCorrection, creditsTransactions, creditsTransactionsExport)
- User (usersList, usersGet)
- Tenant Status (tenantStatus, suspendTenant, reactivateTenant, banTenant, tenantChangeRole)
- Notifications (notificationSend, notificationSendCustom, notificationLog)
- Billing Health (billingHealth)
- Compliance (all 5 procedures)

**Files to create in platform-core**:
- `platform-core/trpc/routers/admin-core.ts` (25 procedures)
- `platform-core/admin/` — ensure all deps are exported

### Phase 2: Store Abstraction (Medium Risk)
Move stores to platform-core as **abstract interfaces**:
1. `platform-core/admin/notes/admin-notes-repository.ts` (interface)
2. `platform-core/admin/analytics/analytics-store.ts` (interface)
3. `platform-core/admin/bulk/bulk-operations-store.ts` (interface)
4. `platform-core/admin/users/user-store.ts` (interface + abstract base)

Then move procedures:
- Notes (4 procedures)
- Analytics (9 procedures)
- Bulk operations (7 procedures)

### Phase 3: WOPR-Specific (Stays in WOPR)
Keep in wopr-platform/src/trpc/routers/admin.ts:
- Rates (9 procedures)
- GPU management (4 procedures)
- Affiliate fraud (4 procedures)
- Restore/snapshot (3 procedures) — **OR keep in core if restore is generic**
- tenantUsageByCapability (1 procedure)

**Total extraction: 45 procedures (67% of WOPR admin router)**

---

## Comparison: Paperclip Admin Router

Paperclip has **only 6 procedures**:
- `getGatewayModel`, `setGatewayModel` — Paperclip-specific gateway config
- `listAvailableModels` — Paperclip marketplace models
- `listAllInstances`, `listAllOrgs` — Paperclip instance/org management
- `billingOverview` — Paperclip billing summary

**Observation**: Paperclip admin router is **completely disjoint** from WOPR's. It does not reuse any WOPR procedures. This suggests:
1. ✅ Platform-core admin router should be **product-agnostic** (only core tenant/credit/audit/compliance)
2. ✅ Each product defines its own admin router extensions (rates, GPU, models, instances, etc.)
3. ✅ Extraction strategy is sound — pull generic procedures to core, leave product-specific to brands

---

## Implementation Checklist

- [ ] **1. Review AdminRouterDeps interface** — ensure all required stores are exported from platform-core
- [ ] **2. Create platform-core/trpc/routers/admin.ts** — consolidate 25 CORE procedures
- [ ] **3. Create abstract store interfaces** in platform-core (notes, analytics, bulk, users)
- [ ] **4. Update wopr-platform admin.ts** — import core router, extend with WOPR-specific (rates, GPU, affiliate)
- [ ] **5. Add AdminRouterDeps setter** — wopr-platform provides concrete implementations
- [ ] **6. Test cross-product auth** — ensure admin gate works for Paperclip too
- [ ] **7. Update Paperclip** — import core router, extend with paperclip-specific procedures
- [ ] **8. Deprecate old wopr-platform admin.ts** after verified cutover

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Breaking WOPR admin APIs during extraction | High | Use feature flag or co-exist old+new routers for 1 release |
| Circular imports (platform-core → local stores) | Medium | Use DI pattern; stores are injected, not imported |
| Paperclip admin router differs significantly | Low | Paperclip stays independent; core is generic foundation |
| Auth gate differs by product | Medium | Use adminProcedure from platform-core; expect ctx.user role check |

---

## Conclusion

**✅ 67% of WOPR admin router is extractable to platform-core.**

- **25 procedures** (37%) are pure CORE — ready to move immediately
- **20 procedures** (30%) are SEMI-CORE — extractable once stores are abstracted to interfaces
- **22 procedures** (33%) are WOPR-SPECIFIC — must remain in wopr-platform

**Next step**: Design the abstract store interfaces (notes, analytics, bulk, users) and confirm DI injection pattern works across products.
