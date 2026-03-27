import { Credit } from "../../../credits/credit.js";
import type { ILedger } from "../../../credits/ledger.js";
import type { ICryptoChargeRepository } from "../charge-store.js";
import type { CryptoWebhookResult } from "../types.js";
import type { EthPaymentEvent } from "./types.js";

export interface EthSettlerDeps {
  chargeStore: Pick<ICryptoChargeRepository, "getByDepositAddress" | "updateStatus" | "markCredited">;
  creditLedger: Pick<ILedger, "credit" | "hasReferenceId">;
  onCreditsPurchased?: (tenantId: string, ledger: ILedger) => Promise<string[]>;
}

/**
 * Settle a native ETH payment — look up charge by deposit address, credit ledger.
 *
 * Same idempotency pattern as EVM stablecoin and BTC settlers:
 *   1. Charge-level: charge.creditedAt != null → skip
 *   2. Transfer-level: creditLedger.hasReferenceId → skip (atomic)
 *   3. Advisory: chargeStore.markCredited
 *
 * Credits the CHARGE amount (not the ETH value) for overpayment safety.
 *
 * CRITICAL: charge.amountUsdCents is in USD cents (integer).
 * Credit.fromCents() converts cents → nanodollars for the ledger.
 */
export async function settleEthPayment(deps: EthSettlerDeps, event: EthPaymentEvent): Promise<CryptoWebhookResult> {
  const { chargeStore, creditLedger } = deps;

  const charge = await chargeStore.getByDepositAddress(event.to.toLowerCase());
  if (!charge) {
    return { handled: false, status: "Invalid" };
  }

  await chargeStore.updateStatus(charge.referenceId, "Settled");

  if (charge.creditedAt != null) {
    return { handled: true, status: "Settled", tenant: charge.tenantId, creditedCents: 0 };
  }

  const creditRef = `eth:${event.chain}:${event.txHash}`;
  if (await creditLedger.hasReferenceId(creditRef)) {
    return { handled: true, status: "Settled", tenant: charge.tenantId, creditedCents: 0 };
  }

  // 2% underpayment tolerance for oracle price drift between checkout and settlement.
  const UNDERPAYMENT_TOLERANCE = 0.98;
  if (event.amountUsdCents < charge.amountUsdCents * UNDERPAYMENT_TOLERANCE) {
    return { handled: true, status: "Settled", tenant: charge.tenantId, creditedCents: 0 };
  }

  const creditCents = charge.amountUsdCents;
  await creditLedger.credit(charge.tenantId, Credit.fromCents(creditCents), "purchase", {
    description: `ETH credit purchase (${event.chain}, tx: ${event.txHash})`,
    referenceId: creditRef,
    fundingSource: "crypto",
  });

  await chargeStore.markCredited(charge.referenceId);

  let reactivatedBots: string[] | undefined;
  if (deps.onCreditsPurchased) {
    reactivatedBots = await deps.onCreditsPurchased(charge.tenantId, creditLedger as ILedger);
    if (reactivatedBots.length === 0) reactivatedBots = undefined;
  }

  return {
    handled: true,
    status: "Settled",
    tenant: charge.tenantId,
    creditedCents: creditCents,
    reactivatedBots,
  };
}
