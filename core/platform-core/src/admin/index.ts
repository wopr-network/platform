export type { IAdminAuditLogRepository } from "./admin-audit-log-repository.js";
export { DrizzleAdminAuditLogRepository } from "./admin-audit-log-repository.js";
export type {
  AdminNote,
  AdminNoteFilters,
  AdminNoteInput,
  AdminUserRow,
  TenantAccountStatus,
  TenantStatusRecord,
  UndoableGrant,
} from "./admin-repository-types.js";
export { BAN_DELETE_DAYS, GRACE_PERIOD_DAYS } from "./admin-repository-types.js";
export type { IAnalyticsRepository } from "./analytics/index.js";
export {
  AnalyticsStore,
  type AutoTopupMetrics,
  type DateRange,
  DrizzleAnalyticsRepository,
  type FloatMetrics,
  type MarginByCapability,
  type ProviderSpendRow,
  type RevenueBreakdownRow,
  type RevenueOverview,
  type TenantHealthSummary,
  type TimeSeriesPoint,
} from "./analytics/index.js";
export type { AdminAuditLogRow, AuditCategory, AuditEntry, AuditFilters } from "./audit-log.js";
export { AdminAuditLog } from "./audit-log.js";
export type { IBulkOperationsRepository } from "./bulk/bulk-operations-repository.js";
export { DrizzleBulkOperationsRepository } from "./bulk/bulk-operations-repository.js";
export type { IBulkOperationsStore } from "./bulk/bulk-operations-store.js";
export { BulkOperationsStore } from "./bulk/bulk-operations-store.js";
// Phase 2 stores: notes, analytics, bulk
export type { IAdminNotesRepository } from "./notes/index.js";
export { AdminNotesStore } from "./notes/index.js";
export type {
  IAdminNotificationQueueRepository,
  NotificationEmailType,
  NotificationInput,
  NotificationRow,
} from "./notifications/index.js";
export { DrizzleAdminNotificationQueueRepository } from "./notifications/index.js";
export type { Role, UserRoleRow } from "./role-store.js";
export { isValidRole, RoleStore } from "./role-store.js";
export { requirePlatformAdmin, requireTenantAdmin } from "./roles/require-role.js";
export type { ResolveTenantId, TenantStatusGateConfig } from "./tenant-status/tenant-status-middleware.js";
export { checkTenantStatus, createTenantStatusGate } from "./tenant-status/tenant-status-middleware.js";
export type { ITenantStatusRepository } from "./tenant-status/tenant-status-repository.js";
export { TenantStatusStore } from "./tenant-status/tenant-status-store.js";
export type { AdminUserFilters, AdminUserListResponse, AdminUserSummary } from "./users/user-store.js";
export { AdminUserStore } from "./users/user-store.js";
