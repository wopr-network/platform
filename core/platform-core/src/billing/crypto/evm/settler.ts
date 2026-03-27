import { Credit } from "../../../credits/credit.js";
import type { ILedger } from "../../../credits/ledger.js";
import type { ICryptoChargeRepository } from "../charge-store.js";
import type { CryptoWebhookResult } from "../types.js";
import type { EvmPaymentEvent } from "./types.js";

export interface EvmSettlerDeps {
  chargeStore: Pick<ICryptoChargeRepository, "getByDepositAddress" | "updateStatus" | "markCredited">;
  creditLedger: Pick<ILedger, "credit" | "hasReferenceId">;
  onCreditsPurchased?: (tenantId: string, ledger: ILedger) => Promise<string[]>;
}

/**
 * Settle an EVM payment event — look up charge by deposit address, credit ledger.
 *
 * Same idempotency pattern as handleCryptoWebhook():
 *   Primary: creditLedger.hasReferenceId() — atomic in ledger transaction
 *   Secondary: chargeStore.markCredited() — advisory
 *
 * Credits the CHARGE amount (not the transfer amount) for overpayment safety.
 *
 * CRITICAL: charge.amountUsdCents is in USD cents (integer).
 * Credit.fromCents() converts cents → nanodollars for the ledger.
 * Never pass raw cents to the ledger — always go through Credit.fromCents().
 */
export async function settleEvmPayment(deps: EvmSettlerDeps, event: EvmPaymentEvent): Promise<CryptoWebhookResult> {
  const { chargeStore, creditLedger } = deps;

  const charge = await chargeStore.getByDepositAddress(event.to.toLowerCase());
  if (!charge) {
    return { handled: false, status: "Invalid" };
  }

  // Update charge status to Settled.
  await chargeStore.updateStatus(charge.referenceId, "Settled");

  // Charge-level idempotency: if this charge was already credited (by any transfer),
  // reject. Prevents double-credit when a user sends two transactions to the same address.
  if (charge.creditedAt != null) {
    return { handled: true, status: "Settled", tenant: charge.tenantId, creditedCents: 0 };
  }

  // Transfer-level idempotency: if this specific tx was already processed, skip.
  const creditRef = `evm:${event.chain}:${event.txHash}:${event.logIndex}`;
  if (await creditLedger.hasReferenceId(creditRef)) {
    return { handled: true, status: "Settled", tenant: charge.tenantId, creditedCents: 0 };
  }

  // Reject underpayment — transfer must cover the charge amount.
  if (event.amountUsdCents < charge.amountUsdCents) {
    return { handled: true, status: "Settled", tenant: charge.tenantId, creditedCents: 0 };
  }

  // Credit the CHARGE amount (NOT the transfer amount — overpayment stays in wallet).
  // charge.amountUsdCents is in USD cents (integer).
  // Credit.fromCents() converts to nanodollars for the ledger.
  const creditCents = charge.amountUsdCents;
  await creditLedger.credit(charge.tenantId, Credit.fromCents(creditCents), "purchase", {
    description: `Stablecoin credit purchase (${event.token} on ${event.chain}, tx: ${event.txHash})`,
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
