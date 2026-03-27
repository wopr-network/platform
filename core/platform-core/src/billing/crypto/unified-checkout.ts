import type { CryptoServiceClient } from "./client.js";

export const MIN_CHECKOUT_USD = 10;

export interface UnifiedCheckoutDeps {
  cryptoService: CryptoServiceClient;
}

export interface UnifiedCheckoutResult {
  depositAddress: string;
  /** Human-readable amount to send (e.g. "50 USDC", "0.014285 ETH"). */
  displayAmount: string;
  amountUsd: number;
  token: string;
  chain: string;
  referenceId: string;
  /** For volatile assets: price at checkout time (microdollars per unit, 10^-6 USD). */
  priceMicros?: number;
}

/**
 * Unified checkout — delegates to CryptoServiceClient.createCharge().
 *
 * The pay server handles xpub management, address derivation, and charge
 * creation. This function is a thin wrapper that validates the amount
 * and maps the response to `UnifiedCheckoutResult`.
 */
export async function createUnifiedCheckout(
  deps: UnifiedCheckoutDeps,
  chain: string,
  opts: { tenant: string; amountUsd: number; callbackUrl?: string },
): Promise<UnifiedCheckoutResult> {
  if (!Number.isFinite(opts.amountUsd) || opts.amountUsd < MIN_CHECKOUT_USD) {
    throw new Error(`Minimum payment amount is $${MIN_CHECKOUT_USD}`);
  }

  const result = await deps.cryptoService.createCharge({
    chain,
    amountUsd: opts.amountUsd,
    callbackUrl: opts.callbackUrl,
  });

  return {
    depositAddress: result.address,
    displayAmount: result.displayAmount ?? `${opts.amountUsd} ${result.token}`,
    amountUsd: opts.amountUsd,
    token: result.token,
    chain: result.chain,
    referenceId: result.chargeId,
    priceMicros: result.priceMicros,
  };
}
