import { trpcVanilla } from "./trpc";

// ---- Types ----

export interface SuppressionEvent {
  id: string;
  referrerTenantId: string;
  referredTenantId: string;
  verdict: string;
  signals: string[];
  signalDetails: Record<string, string>;
  phase: string;
  createdAt: string;
}

export interface VelocityReferrer {
  referrerTenantId: string;
  payoutCount30d: number;
  payoutTotal30dCents: number;
}

export interface FingerprintCluster {
  stripeFingerprint: string;
  tenantIds: string[];
}

// ---- API calls ----

export async function getAffiliateSuppressions(
  limit = 50,
  offset = 0,
): Promise<{ events: SuppressionEvent[]; total: number }> {
  return trpcVanilla.admin.affiliateSuppressions.query({ limit, offset });
}

export async function getAffiliateVelocity(
  capReferrals = 20,
  capCredits = 20000,
): Promise<VelocityReferrer[]> {
  return trpcVanilla.admin.affiliateVelocity.query({ capReferrals, capCredits });
}

export async function getAffiliateFingerprintClusters(): Promise<FingerprintCluster[]> {
  return trpcVanilla.admin.affiliateFingerprintClusters.query(undefined);
}

export async function blockAffiliateFingerprint(
  fingerprint: string,
): Promise<{ success: boolean }> {
  return trpcVanilla.admin.affiliateBlockFingerprint.mutate({ fingerprint });
}
