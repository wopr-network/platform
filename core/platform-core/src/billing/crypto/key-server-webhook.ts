/**
 * Key Server webhook handler — processes payment events from the
 * centralized crypto key server.
 *
 * Called on EVERY status update (not just terminal):
 *   - "partial" / "Processing" → update progress, no credit
 *   - "confirmed" / "Settled" → update progress + credit ledger
 *   - "expired" / "failed" → update progress, no credit
 *
 * Payload shape (from watcher-service.ts):
 * {
 *   chargeId: "btc:bc1q...",
 *   chain: "bitcoin",
 *   address: "bc1q...",
 *   amountReceivedCents: 5000,
 *   status: "confirmed",
 *   txHash: "abc123...",
 *   amountReceived: "50000 sats",
 *   confirmations: 6,
 *   confirmationsRequired: 6
 * }
 *
 * Replaces handleCryptoWebhook() for products using the key server.
 */
import { Credit } from "../../credits/credit.js";
import type { ILedger } from "../../credits/ledger.js";
import type { IWebhookSeenRepository } from "../webhook-seen-repository.js";
import type { ICryptoChargeRepository } from "./charge-store.js";
import type { CryptoChargeStatus } from "./types.js";

export interface KeyServerWebhookPayload {
  chargeId: string;
  chain: string;
  address: string;
  /** @deprecated Use amountReceivedCents instead. Kept for one release cycle. */
  amountUsdCents?: number;
  amountReceivedCents?: number;
  status: string;
  txHash?: string;
  amountReceived?: string;
  confirmations?: number;
  confirmationsRequired?: number;
}

export interface KeyServerWebhookDeps {
  chargeStore: ICryptoChargeRepository;
  creditLedger: ILedger;
  replayGuard: IWebhookSeenRepository;
  onCreditsPurchased?: (tenantId: string, ledger: ILedger) => Promise<string[]>;
}

export interface KeyServerWebhookResult {
  handled: boolean;
  duplicate?: boolean;
  tenant?: string;
  creditedCents?: number;
  reactivatedBots?: string[];
  status?: CryptoChargeStatus;
  confirmations?: number;
  confirmationsRequired?: number;
}

/**
 * Map legacy/watcher status strings to canonical CryptoChargeStatus.
 * Accepts both old BTCPay-style ("Settled", "Processing") and new canonical ("confirmed", "partial").
 */
export function normalizeStatus(raw: string): CryptoChargeStatus {
  switch (raw) {
    case "confirmed":
    case "Settled":
    case "InvoiceSettled":
      return "confirmed";
    case "partial":
    case "Processing":
    case "InvoiceProcessing":
    case "InvoiceReceivedPayment":
      return "partial";
    case "expired":
    case "Expired":
    case "InvoiceExpired":
      return "expired";
    case "failed":
    case "Invalid":
    case "InvoiceInvalid":
      return "failed";
    case "pending":
    case "New":
    case "InvoiceCreated":
      return "pending";
    default:
      return "pending";
  }
}

/**
 * Process a payment webhook from the crypto key server.
 *
 * Idempotency: deduplicate by chargeId + status + confirmations so that
 * multiple progress updates (0→1→2→...→6 confirmations) each get through,
 * but exact duplicates are rejected.
 */
export async function handleKeyServerWebhook(
  deps: KeyServerWebhookDeps,
  payload: KeyServerWebhookPayload,
): Promise<KeyServerWebhookResult> {
  const { chargeStore, creditLedger } = deps;

  const status = normalizeStatus(payload.status);
  const confirmations = payload.confirmations ?? 0;
  const confirmationsRequired = payload.confirmationsRequired ?? 1;
  // Support deprecated amountUsdCents field as fallback
  const amountReceivedCents = payload.amountReceivedCents ?? payload.amountUsdCents ?? 0;

  // Replay guard: deduplicate by chargeId + status + confirmations
  // This allows multiple progress updates for the same charge
  const dedupeKey = `ks:${payload.chargeId}:${status}:${confirmations}`;
  if (await deps.replayGuard.isDuplicate(dedupeKey, "crypto")) {
    return { handled: true, duplicate: true };
  }

  // Look up the charge to find the tenant + amount
  const charge = await chargeStore.getByReferenceId(payload.chargeId);
  if (!charge) {
    return { handled: false };
  }

  // Always update progress on every webhook
  await chargeStore.updateProgress(payload.chargeId, {
    status,
    amountReceivedCents,
    confirmations,
    confirmationsRequired,
    txHash: payload.txHash,
  });

  // Also call deprecated updateStatus for backward compat with downstream consumers
  const legacyStatusMap: Record<CryptoChargeStatus, string> = {
    pending: "New",
    partial: "Processing",
    confirmed: "Settled",
    expired: "Expired",
    failed: "Invalid",
  };
  await chargeStore.updateStatus(
    payload.chargeId,
    legacyStatusMap[status] as "Settled",
    charge.token ?? undefined,
    payload.amountReceived,
  );

  if (status === "confirmed") {
    // Idempotency: check ledger referenceId (atomic, same as BTCPay handler)
    const creditRef = `crypto:${payload.chargeId}`;
    if (await creditLedger.hasReferenceId(creditRef)) {
      await deps.replayGuard.markSeen(dedupeKey, "crypto");
      return { handled: true, duplicate: true, tenant: charge.tenantId, status, confirmations, confirmationsRequired };
    }

    // Credit the original USD amount requested.
    // charge.amountUsdCents is integer cents. Credit.fromCents() → nanodollars.
    await creditLedger.credit(charge.tenantId, Credit.fromCents(charge.amountUsdCents), "purchase", {
      description: `Crypto payment confirmed (${payload.chain}, tx: ${payload.txHash ?? "unknown"})`,
      referenceId: creditRef,
      fundingSource: "crypto",
    });

    await chargeStore.markCredited(payload.chargeId);

    let reactivatedBots: string[] | undefined;
    if (deps.onCreditsPurchased) {
      reactivatedBots = await deps.onCreditsPurchased(charge.tenantId, creditLedger);
      if (reactivatedBots.length === 0) reactivatedBots = undefined;
    }

    await deps.replayGuard.markSeen(dedupeKey, "crypto");
    return {
      handled: true,
      tenant: charge.tenantId,
      creditedCents: charge.amountUsdCents,
      reactivatedBots,
      status,
      confirmations,
      confirmationsRequired,
    };
  }

  // Non-confirmed status — progress already updated above, no credit
  await deps.replayGuard.markSeen(dedupeKey, "crypto");
  return { handled: true, tenant: charge.tenantId, status, confirmations, confirmationsRequired };
}
