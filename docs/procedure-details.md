# Admin Router — Procedure Details

**67 Procedures across WOPR admin router (37 queries, 30 mutations)**

---

## CORE PROCEDURES (25/67 — 37%)

### Audit Log (2)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|--------------|
| 1 | auditLog | query | `{admin?, action?, category?, tenant?, from?, to?, limit?, offset?}` | `{entries: [], total: 0}` | AdminAuditLog |
| 2 | auditLogExport | query | `{admin?, action?, category?, tenant?, from?, to?}` | `{csv: string}` | AdminAuditLog |

### Credits (8)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|--------------|
| 3 | creditsBalance | query | `{tenantId}` | `{tenant, balance_credits}` | ILedger |
| 4 | creditsGrant | mutation | `{tenantId, amount_cents, reason, expiresAt?}` | JournalEntry | ILedger, AdminAuditLog |
| 5 | creditsRefund | mutation | `{tenantId, amount_cents, reason, reference_ids?}` | JournalEntry | ILedger, AdminAuditLog |
| 6 | creditsCorrection | mutation | `{tenantId, correctionId, amount_cents, reason}` | JournalEntry | ILedger, AdminAuditLog |
| 7 | creditsTransactions | query | `{tenantId, from?, to?, limit?, offset?}` | `{transactions: [], total}` | ILedger |
| 8 | creditsTransactionsExport | query | `{tenantId, from?, to?}` | `{csv: string}` | ILedger |

### Users (2)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|--------------|
| 9 | usersList | query | `{limit?, offset?, sortBy?, sortOrder?}` | `{users: [], total}` | AdminUserStore |
| 10 | usersGet | query | `{userId}` | User | AdminUserStore |

### Tenant Status (4)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|--------------|
| 11 | tenantStatus | query | `{tenantId}` | `{tenantId, status}` | ITenantStatusRepository |
| 12 | suspendTenant | mutation | `{tenantId, reason, gracePeriodMs?}` | void | ITenantStatusRepository, ILedger |
| 13 | reactivateTenant | mutation | `{tenantId, reason}` | void | ITenantStatusRepository |
| 14 | banTenant | mutation | `{tenantId, reason, deleteData?}` | void | ITenantStatusRepository |

### Tenant Info (2)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|--------------|
| 15 | tenantDetail | query | `{tenantId}` | Tenant | ITenantStatusRepository, AdminAuditLog |
| 16 | tenantChangeRole | mutation | `{tenantId, role}` | void | RoleStore |

### Notifications (3)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|--------------|
| 17 | notificationSend | mutation | `{tenantId, type, recipient, data}` | `{id, status}` | NotificationService |
| 18 | notificationSendCustom | mutation | `{tenantId, template, recipients, vars}` | `{id, sent, failed}` | NotificationService |
| 19 | notificationLog | query | `{tenantId?, from?, to?, limit?}` | `{log: [], total}` | INotificationQueueRepository |

### Billing & System Health (2)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|--------------|
| 20 | billingHealth | query | `{probePayments?, includeMetrics?}` | `{status, activeBots, activeTenants, health: {...}}` | MetricsCollector, AlertChecker, SystemResourceMonitor |

### Compliance (5)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|--------------|
| 21 | complianceExportRequests | query | `{tenantId?, limit?, offset?}` | `{requests: [], total}` | IAccountExportStore |
| 22 | complianceTriggerExport | mutation | `{tenantId, reason}` | `{requestId, status}` | IAccountExportStore |
| 23 | complianceDeletionRequests | query | `{tenantId?, limit?, offset?}` | `{requests: [], total}` | IAccountDeletionStore |
| 24 | complianceTriggerDeletion | mutation | `{tenantId, reason}` | `{requestId, status}` | IAccountDeletionStore |
| 25 | complianceCancelDeletion | mutation | `{tenantId, requestId}` | void | IAccountDeletionStore |

---

## SEMI-CORE PROCEDURES (20/67 — 30%)

### Admin Notes (4)
| # | Name | Type | Input | Output | Dependencies | Blocker |
|---|------|------|-------|--------|-------------|---------|
| 26 | notesList | query | `{tenantId?, limit?, offset?}` | `{notes: [], total}` | IAdminNotesRepository | Abstract to platform-core |
| 27 | notesCreate | mutation | `{tenantId, title, body, tags?}` | Note | IAdminNotesRepository | "" |
| 28 | notesUpdate | mutation | `{noteId, title?, body?, tags?}` | Note | IAdminNotesRepository | "" |
| 29 | notesDelete | mutation | `{noteId}` | void | IAdminNotesRepository | "" |

### Analytics (9)
| # | Name | Type | Input | Output | Dependencies | Blocker |
|---|------|------|-------|--------|-------------|---------|
| 30 | analyticsRevenue | query | `{from?, to?}` | `{revenue: {total, byProduct}}` | AnalyticsStore | Abstract to platform-core |
| 31 | analyticsFloat | query | `{from?, to?}` | `{cashOnHand, outstandingCharges}` | AnalyticsStore | "" |
| 32 | analyticsRevenueBreakdown | query | `{from?, to?}` | `{breakdown: {byProduct, byTier}}` | AnalyticsStore | "" |
| 33 | analyticsMarginByCapability | query | `{from?, to?}` | `{margins: {[capability]: {margin, revenue}}}` | AnalyticsStore | "" |
| 34 | analyticsProviderSpend | query | `{from?, to?}` | `{spend: {[provider]: amount}}` | AnalyticsStore | "" |
| 35 | analyticsTenantHealth | query | `{from?, to?, filter?}` | `{tenants: [{id, status, balance, activity}]}` | AnalyticsStore | "" |
| 36 | analyticsAutoTopup | query | `{from?, to?}` | `{autoTopup: {active, inactive, failed}}` | AnalyticsStore | "" |
| 37 | analyticsTimeSeries | query | `{from?, to?, granularity?}` | `{series: [{timestamp, revenue, spend}]}` | AnalyticsStore | "" |
| 38 | analyticsExport | query | `{from?, to?, sections: [...]}` | `{csv: string}` | AnalyticsStore | "" |

### Bulk Operations (7)
| # | Name | Type | Input | Output | Dependencies | Blocker |
|---|------|------|-------|--------|-------------|---------|
| 39 | bulkSelectAll | query | `{filter?, limit?}` | `{tenants: [], total}` | IBulkOperationsStore | Abstract to platform-core |
| 40 | bulkDryRun | query | `{operation, tenantIds}` | `{wouldAffect: number, preview: []}` | IBulkOperationsStore | "" |
| 41 | bulkGrant | mutation | `{tenantIds, amount_cents, reason}` | `{affected, succeeds, failed}` | IBulkOperationsStore | "" |
| 42 | bulkGrantUndo | mutation | `{bulkId}` | void | IBulkOperationsStore | "" |
| 43 | bulkSuspend | mutation | `{tenantIds, reason, gracePeriodMs?}` | `{affected, succeeds, failed}` | IBulkOperationsStore | "" |
| 44 | bulkReactivate | mutation | `{tenantIds, reason}` | `{affected, succeeds, failed}` | IBulkOperationsStore | "" |
| 45 | bulkExport | mutation | `{tenantIds, format}` | `{jobId, status}` | IBulkOperationsStore | "" |

---

## WOPR-SPECIFIC PROCEDURES (22/67 — 33%)

### Rates (9)
These encode WOPR's dual-marketplace model (sell rates to customers, provider rates to suppliers).

| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|-------------|
| 46 | ratesListSell | query | `{limit?, offset?}` | `{rates: [], total}` | RateStore |
| 47 | ratesCreateSell | mutation | `{model, tier, price_cents, duration_ms}` | Rate | RateStore |
| 48 | ratesUpdateSell | mutation | `{rateId, price_cents?, duration_ms?}` | Rate | RateStore |
| 49 | ratesDeleteSell | mutation | `{rateId}` | void | RateStore |
| 50 | ratesListProvider | query | `{limit?, offset?}` | `{rates: [], total}` | RateStore |
| 51 | ratesCreateProvider | mutation | `{provider, model, price_cents}` | Rate | RateStore |
| 52 | ratesUpdateProvider | mutation | `{rateId, price_cents?}` | Rate | RateStore |
| 53 | ratesDeleteProvider | mutation | `{rateId}` | void | RateStore |
| 54 | ratesMargins | query | `{from?, to?}` | `{margins: {[model]: margin}}` | RateStore |

### GPU Management (4)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|-------------|
| 55 | gpuAllocations | query | `{limit?, offset?}` | `{allocations: [], total}` | IGpuAllocationRepository |
| 56 | updateGpuAllocation | mutation | `{allocationId, maxConcurrent?, reserved?}` | Allocation | IGpuAllocationRepository |
| 57 | gpuConfigurations | query | `{limit?, offset?}` | `{configs: [], total}` | IGpuConfigurationRepository |
| 58 | updateGpuConfiguration | mutation | `{configId, vram?, cores?, priority?}` | Config | IGpuConfigurationRepository |

### Affiliate Fraud Detection (4)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|-------------|
| 59 | affiliateSuppressions | query | `{limit?, offset?}` | `{suppressions: [], total}` | IAffiliateFraudAdminRepository |
| 60 | affiliateVelocity | query | `{timeWindow?}` | `{velocity: {[fingerprint]: count}}` | IAffiliateFraudAdminRepository |
| 61 | affiliateFingerprintClusters | query | `{limit?, offset?}` | `{clusters: [], total}` | IAffiliateFraudAdminRepository |
| 62 | affiliateBlockFingerprint | mutation | `{fingerprint, reason}` | void | IAffiliateFraudAdminRepository |

### Snapshot/Restore (3)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|-------------|
| 63 | restoreListSnapshots | query | `{tenantId, limit?, offset?}` | `{snapshots: [], total}` | RestoreService |
| 64 | restoreFromSnapshot | mutation | `{tenantId, snapshotId}` | `{jobId, status}` | RestoreService |
| 65 | restoreHistory | query | `{tenantId, limit?, offset?}` | `{history: [], total}` | IRestoreLogStore |

### Usage Analytics (1)
| # | Name | Type | Input | Output | Dependencies |
|---|------|------|-------|--------|-------------|
| 66 | tenantUsageByCapability | query | `{tenantId, from?, to?}` | `{usage: {[capability]: amount}}` | AnalyticsStore |

---

## Auth & Validation

All procedures use **`adminProcedure`** from platform-core, which:
- ✅ Checks `ctx.user?.roles.includes('platform_admin')`
- ✅ Throws "Authentication required" if `ctx.user` is undefined
- ✅ Throws "Unauthorized" if user lacks platform_admin role

**No X-Product filtering** — tenants are passed as input or read from tenant-scoped context.

---

## Dependencies Summary

### Platform-Core (Already Available)
- AdminAuditLog, RoleStore
- ILedger, Credit, IAutoTopupSettingsRepository
- NotificationService, INotificationQueueRepository
- ISessionUsageRepository
- MeterAggregator
- PaymentHealthStatus
- AlertChecker, MetricsCollector, SystemResourceMonitor
- RestoreService, IRestoreLogStore
- ITenantStatusRepository
- IAccountExportStore
- IAccountDeletionStore

### WOPR-Specific (Local, Need Abstraction)
- AdminUserStore → needs abstraction/interface in platform-core
- AnalyticsStore → needs abstraction/interface in platform-core
- IBulkOperationsStore → needs abstraction/interface in platform-core
- IAdminNotesRepository → needs abstraction/interface in platform-core

### WOPR-Specific (Stay in WOPR)
- RateStore (WOPR marketplace model)
- IGpuAllocationRepository (GPU fleet)
- IGpuConfigurationRepository (GPU hardware)
- IAffiliateFraudAdminRepository (WOPR affiliate program)

---

## Extraction Candidates (by dependency count)

### Zero Dependencies (Easiest)
None (most depend on at least one store).

### One Dependency
- auditLog, auditLogExport (AdminAuditLog only)
- creditsBalance, creditsTransactions, creditsTransactionsExport (ILedger only)
- tenantStatus (ITenantStatusRepository only)

### Two Dependencies
- creditsGrant, creditsRefund, creditsCorrection (ILedger + AdminAuditLog)
- suspendTenant (ITenantStatusRepository + ILedger)
- notificationLog (INotificationQueueRepository only)

### Complex (3+ dependencies or chains)
- billingHealth (MetricsCollector, AlertChecker, SystemResourceMonitor, PaymentHealthStatus)
- analyticsTimeSeries, analyticsExport (AnalyticsStore + time formatting)

---

## Notes for Implementation

1. **Singleton injection**: All deps() calls expect a global _deps object set by setAdminRouterDeps(). This pattern must be preserved when extracting to platform-core.

2. **Audit logging**: Most mutations call `getAuditLog().log()` to record admin actions. This is already centralized.

3. **Error handling**: Most procedures wrap operations in try/catch and log both success and failure to audit log.

4. **Pagination**: Queries support `limit`/`offset`. Analytics export uses CSV. No cursor-based pagination yet.

5. **Tenant scoping**: All tenant-accessing procedures accept tenantId in input. No implicit tenant from ctx.tenantId (which is undefined for admins).

6. **Date ranges**: Procedures use `{ from, to }` in milliseconds (Unix time). Defaults to last 30 days if not specified.
