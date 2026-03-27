import { trpcVanilla } from "./trpc";

// ---- Types ----

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string | null;
  tenant_id: string;
  status: string;
  role: string;
  credit_balance_cents: number;
  agent_count: number;
  last_seen: number | null;
  created_at: number;
}

export interface TenantDetailResponse {
  user: AdminUserSummary | null;
  credits: {
    balance_cents: number;
    recent_transactions: { entries: CreditAdjustment[]; total: number };
  };
  status: {
    tenantId: string;
    status: string;
    statusReason?: string | null;
    statusChangedAt?: number | null;
    statusChangedBy?: string | null;
    graceDeadline?: string | null;
    dataDeleteAfter?: string | null;
  };
  usage: {
    summaries: UsageSummary[];
    total: { totalCost: number; totalCharge: number; eventCount: number };
  };
}

export interface CreditAdjustment {
  id: string;
  tenant: string;
  type: "grant" | "refund" | "correction";
  amount_cents: number;
  reason: string;
  admin_user: string;
  reference_ids: string | null;
  created_at: number;
}

export interface UsageSummary {
  tenant: string;
  capability: string;
  provider: string;
  event_count: number;
  total_cost: number;
  total_charge: number;
  total_duration: number;
  window_start: number;
  window_end: number;
}

export interface AdminNote {
  id: string;
  tenant_id: string;
  admin_user: string;
  content: string;
  created_at: number;
}

export interface BotInstance {
  id: string;
  tenantId: string;
  name: string;
  nodeId: string | null;
  billingState: string;
  suspendedAt: string | null;
  destroyAfter: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- API calls ----

export async function getTenantDetail(tenantId: string): Promise<TenantDetailResponse> {
  return trpcVanilla.admin.tenantDetail.query({ tenantId });
}

export async function getTenantAgents(tenantId: string): Promise<BotInstance[]> {
  const result = await trpcVanilla.admin.tenantAgents.query({ tenantId });
  return result.agents;
}

export async function getTenantNotes(tenantId: string): Promise<AdminNote[]> {
  // Backend procedure is notesList, not tenantNotes
  const result = await trpcVanilla.admin.notesList.query({ tenantId });
  return result.notes;
}

export async function addTenantNote(tenantId: string, content: string): Promise<AdminNote> {
  // Backend procedure is notesCreate, not tenantNoteAdd
  return trpcVanilla.admin.notesCreate.mutate({ tenantId, content });
}

export async function suspendTenant(tenantId: string, reason: string): Promise<void> {
  await trpcVanilla.admin.suspendTenant.mutate({ tenantId, reason });
}

export async function reactivateTenant(tenantId: string): Promise<void> {
  await trpcVanilla.admin.reactivateTenant.mutate({ tenantId });
}

export async function grantCredits(
  tenantId: string,
  amount_cents: number,
  reason: string,
): Promise<void> {
  await trpcVanilla.admin.creditsGrant.mutate({ tenantId, amount_cents, reason });
}

export async function refundCredits(
  tenantId: string,
  amount_cents: number,
  reason: string,
): Promise<void> {
  await trpcVanilla.admin.creditsRefund.mutate({ tenantId, amount_cents, reason });
}

export async function changeRole(userId: string, tenantId: string, role: string): Promise<void> {
  await trpcVanilla.admin.tenantChangeRole.mutate({ userId, tenantId, role });
}

export async function banTenant(
  tenantId: string,
  reason: string,
  tosReference: string,
  confirmName: string,
): Promise<void> {
  await trpcVanilla.admin.banTenant.mutate({ tenantId, reason, tosReference, confirmName });
}

export async function getTransactionsCsv(tenantId: string): Promise<string> {
  const result = await trpcVanilla.admin.creditsTransactionsExport.query({ tenantId });
  return result.csv;
}

export async function getTransactions(
  tenantId: string,
  filters?: {
    type?: string;
    from?: number;
    to?: number;
    limit?: number;
    offset?: number;
  },
): Promise<{ entries: CreditAdjustment[]; total: number }> {
  return trpcVanilla.admin.creditsTransactions.query({ tenantId, ...filters });
}

export async function getTenantUsageByCapability(
  tenantId: string,
  days = 30,
): Promise<UsageSummary[]> {
  const result = await trpcVanilla.admin.tenantUsageByCapability.query({ tenantId, days });
  return result.usage;
}

export async function getUsersList(params?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ users: AdminUserSummary[]; total: number }> {
  return trpcVanilla.admin.usersList.query(params ?? {});
}

export async function bulkGrantCredits(
  tenantIds: string[],
  amountCents: number,
  reason: string,
): Promise<void> {
  await trpcVanilla.admin.bulkGrant.mutate({ tenantIds, amountCents, reason });
}

export async function bulkSuspendTenants(tenantIds: string[], reason: string): Promise<void> {
  await trpcVanilla.admin.bulkSuspend.mutate({ tenantIds, reason });
}

export async function bulkReactivateTenants(tenantIds: string[]): Promise<void> {
  await trpcVanilla.admin.bulkReactivate.mutate({ tenantIds });
}

// ---- Onboarding ----

export interface OnboardingFunnelStep {
  step: string;
  label: string;
  started: number;
  completed: number;
  dropped: number;
  completion_rate: number;
  avg_duration_ms: number | null;
}

export interface OnboardingFunnelStats {
  steps: OnboardingFunnelStep[];
  total_started: number;
  total_completed: number;
  overall_completion_rate: number;
  time_to_first_bot_ms: number | null;
}

export interface OnboardingScript {
  id: string;
  name: string;
  content: string;
  version: number;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export async function getOnboardingFunnelStats(days = 30): Promise<OnboardingFunnelStats> {
  return trpcVanilla.admin.onboardingFunnelStats.query({ days });
}

export async function getOnboardingScripts(): Promise<OnboardingScript[]> {
  const result = await trpcVanilla.admin.onboardingScriptList.query({});
  return result.scripts;
}

export async function saveOnboardingScript(
  id: string | null,
  name: string,
  content: string,
): Promise<OnboardingScript> {
  return trpcVanilla.admin.onboardingScriptSave.mutate({ id, name, content });
}

// ---- Roles ----

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: number;
}

export interface UserRoleAssignment {
  user_id: string;
  tenant_id: string;
  email: string;
  name: string | null;
  role: string;
  assigned_at: number | null;
  assigned_by: string | null;
}

export async function getRolesList(): Promise<{
  roles: AdminRole[];
  assignments: UserRoleAssignment[];
}> {
  return trpcVanilla.admin.rolesList.query({});
}

export async function assignRole(userId: string, tenantId: string, role: string): Promise<void> {
  await trpcVanilla.admin.rolesAssign.mutate({ userId, tenantId, role });
}

export async function revokeRole(userId: string, tenantId: string, role: string): Promise<void> {
  await trpcVanilla.admin.rolesRevoke.mutate({ userId, tenantId, role });
}

// ---- Migrations ----

export interface MigrationRecord {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  applied_at: number | null;
  duration_ms: number | null;
  error: string | null;
}

export interface MigrationSnapshot {
  id: string;
  tenant_id: string;
  name: string;
  size_bytes: number;
  created_at: number;
}

export interface MigrationRestoreRecord {
  id: string;
  tenant_id: string;
  snapshot_id: string;
  snapshot_name: string;
  restored_by: string;
  restored_at: number;
  status: "pending" | "completed" | "failed";
  error: string | null;
}

export async function getMigrations(): Promise<MigrationRecord[]> {
  const result = await trpcVanilla.admin.migrationList.query({});
  return result.migrations;
}

export async function getMigrationSnapshots(tenantId: string): Promise<MigrationSnapshot[]> {
  const result = await trpcVanilla.admin.migrationSnapshotList.query({ tenantId });
  return result.snapshots;
}

export async function restoreMigrationSnapshot(
  tenantId: string,
  snapshotId: string,
): Promise<void> {
  await trpcVanilla.admin.migrationRestore.mutate({ tenantId, snapshotId });
}

export async function getMigrationRestoreHistory(
  tenantId: string,
): Promise<MigrationRestoreRecord[]> {
  const result = await trpcVanilla.admin.migrationRestoreHistory.query({ tenantId });
  return result.history;
}
