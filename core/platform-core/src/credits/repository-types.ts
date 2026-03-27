import type { Credit } from "./credit.js";

/** Domain type for a provisioned phone number tracked for monthly billing. */
export interface ProvisionedPhoneNumber {
  sid: string;
  tenantId: string;
  phoneNumber: string;
  provisionedAt: string;
  lastBilledAt: string | null;
}

export interface DividendStats {
  pool: Credit;
  activeUsers: number;
  perUser: Credit;
  nextDistributionAt: string;
  userEligible: boolean;
  userLastPurchaseAt: string | null;
  userWindowExpiresAt: string | null;
}

export interface DividendHistoryEntry {
  date: string;
  amount: Credit;
  pool: Credit;
  activeUsers: number;
}

export interface WebhookSeenEvent {
  eventId: string;
  source: string;
  seenAt: number;
}
