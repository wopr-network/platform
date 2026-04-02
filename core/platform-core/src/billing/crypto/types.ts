/** BTCPay Server invoice states (Greenfield API v1). */
export type CryptoPaymentState = "New" | "Processing" | "Expired" | "Invalid" | "Settled";

/** Charge status for the UI-facing payment lifecycle. */
export type CryptoChargeStatus = "pending" | "partial" | "confirmed" | "expired" | "failed";

/** Full charge record for UI display — includes partial payment progress and confirmations. */
export interface CryptoCharge {
  id: string;
  tenantId: string;
  chain: string;
  token: string;
  status: CryptoChargeStatus;
  amountExpectedCents: number;
  amountReceivedCents: number;
  /** Native crypto amount expected (base units as string, e.g. sats or wei). */
  expectedAmount: string | null;
  /** Native crypto amount received so far (base units as string). */
  receivedAmount: string | null;
  /** Token decimals for converting native units to display units. */
  decimals: number;
  confirmations: number;
  confirmationsRequired: number;
  txHash?: string;
  credited: boolean;
  createdAt: Date;
}

/** Options for creating a crypto payment session. */
export interface CryptoCheckoutOpts {
  /** Internal tenant ID. */
  tenant: string;
  /** Amount in USD (minimum $10). */
  amountUsd: number;
}

/** Result of processing a crypto webhook event. */
export interface CryptoWebhookResult {
  handled: boolean;
  status: string;
  tenant?: string;
  creditedCents?: number;
  reactivatedBots?: string[];
  duplicate?: boolean;
}
