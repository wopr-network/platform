import { apiFetch } from "./api";
import { trpcVanilla } from "./trpc";

// --- Types ---

export interface DeletionRequest {
  id: string;
  tenantId: string;
  requestedBy: string;
  status: string;
  deleteAfter: string;
  cancelReason: string | null;
  completedAt: string | null;
  deletionSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportRequest {
  id: string;
  tenantId: string;
  requestedBy: string;
  status: string;
  format: string;
  downloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceReport {
  generatedAt: string;
  period: { from: string; to: string };
  sections: {
    accessLogging: {
      totalEntries: number;
      oldestEntry: string | null;
      newestEntry: string | null;
      actionBreakdown: Record<string, number>;
      retentionDays: number;
    };
    backupRecovery: {
      totalContainers: number;
      containersWithRecentBackup: number;
      staleContainers: number;
      lastVerificationReport: string | null;
    };
    encryption: {
      algorithm: string;
      keyDerivation: string;
      tlsEnforced: boolean;
    };
    mfaEnforcement: {
      pluginEnabled: boolean;
      tenantsWithMfaMandate: number;
      totalTenants: number;
    };
    accessReview: {
      adminActions: number;
      adminActionBreakdown: Record<string, number>;
    };
  };
}

export interface RetentionPolicy {
  dataType: string;
  retentionDays: number;
  autoDelete: boolean;
  lastPurge: string | null;
  recordsAffected: number;
}

// --- API calls ---

export async function fetchComplianceEvidence(from: string, to: string): Promise<EvidenceReport> {
  return apiFetch<EvidenceReport>(
    `/admin/compliance/evidence?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export async function fetchRetentionPolicies(): Promise<RetentionPolicy[]> {
  return apiFetch<RetentionPolicy[]>("/admin/compliance/retention");
}

export async function getDeletionRequests(filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ requests: DeletionRequest[]; total: number }> {
  return trpcVanilla.admin.complianceDeletionRequests.query(filters ?? {});
}

export async function triggerDeletion(tenantId: string, reason: string): Promise<DeletionRequest> {
  return trpcVanilla.admin.complianceTriggerDeletion.mutate({
    tenantId,
    reason,
  });
}

export async function getExportRequests(filters?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ requests: ExportRequest[]; total: number }> {
  return trpcVanilla.admin.complianceExportRequests.query(filters ?? {});
}

export async function triggerExport(tenantId: string, reason: string): Promise<ExportRequest> {
  return trpcVanilla.admin.complianceTriggerExport.mutate({
    tenantId,
    reason,
  });
}

export async function cancelDeletion(requestId: string): Promise<DeletionRequest> {
  return trpcVanilla.admin.complianceCancelDeletion.mutate({ requestId });
}

export async function updateRetentionPolicy(
  dataType: string,
  updates: { retentionDays?: number; autoDelete?: boolean },
): Promise<RetentionPolicy> {
  return apiFetch<RetentionPolicy>(`/admin/compliance/retention/${encodeURIComponent(dataType)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
    headers: { "Content-Type": "application/json" },
  });
}
