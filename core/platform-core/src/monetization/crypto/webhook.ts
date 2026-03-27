import type { CryptoWebhookPayload, ICryptoChargeRepository } from "../../billing/crypto/index.js";
import { handleKeyServerWebhook } from "../../billing/crypto/key-server-webhook.js";
import type { IWebhookSeenRepository } from "../../billing/webhook-seen-repository.js";
import type { ILedger } from "../../credits/ledger.js";
import type { BotBilling } from "../credits/bot-billing.js";

export interface CryptoWebhookDeps {
  chargeStore: ICryptoChargeRepository;
  creditLedger: ILedger;
  botBilling?: BotBilling;
  replayGuard: IWebhookSeenRepository;
}

/**
 * Process a crypto payment webhook from the key server (WOPR-specific version).
 *
 * Delegates to handleKeyServerWebhook() for charge lookup, ledger crediting,
 * and idempotency. Adds WOPR-specific bot reactivation via botBilling.
 */
export async function handleCryptoWebhook(
  deps: CryptoWebhookDeps,
  payload: CryptoWebhookPayload,
): Promise<{
  handled: boolean;
  duplicate?: boolean;
  tenant?: string;
  creditedCents?: number;
  reactivatedBots?: string[];
}> {
  return handleKeyServerWebhook(
    {
      chargeStore: deps.chargeStore,
      creditLedger: deps.creditLedger,
      replayGuard: deps.replayGuard,
      onCreditsPurchased: deps.botBilling
        ? (tenantId, ledger) => deps.botBilling?.checkReactivation(tenantId, ledger) ?? Promise.resolve([])
        : undefined,
    },
    payload,
  );
}
