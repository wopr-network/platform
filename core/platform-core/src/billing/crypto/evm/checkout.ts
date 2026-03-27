import { Credit } from "../../../credits/credit.js";
import type { ICryptoChargeRepository } from "../charge-store.js";
import { getTokenConfig, tokenAmountFromCents } from "./config.js";
import type { StablecoinCheckoutOpts } from "./types.js";

export const MIN_STABLECOIN_USD = 10;

export interface StablecoinCheckoutDeps {
  chargeStore: Pick<ICryptoChargeRepository, "getNextDerivationIndex" | "createStablecoinCharge">;
  /** HD key derivation function — injected from @wopr-network/platform-crypto-server. */
  deriveAddress: (xpub: string, index: number, encoding: string) => string;
  xpub: string;
}

export interface StablecoinCheckoutResult {
  depositAddress: string;
  amountRaw: string;
  amountUsd: number;
  chain: string;
  token: string;
  referenceId: string;
}

/**
 * Create a stablecoin checkout — derive a unique deposit address, store the charge.
 *
 * Race safety: the unique constraint on derivation_index prevents two concurrent
 * checkouts from claiming the same index. On conflict, we retry with the next index.
 *
 * CRITICAL: amountUsd is converted to integer cents via Credit.fromDollars().toCentsRounded().
 * The charge store holds USD cents (integer). Credit.fromCents() handles the
 * cents → nanodollars conversion when crediting the ledger in the settler.
 */
export async function createStablecoinCheckout(
  deps: StablecoinCheckoutDeps,
  opts: StablecoinCheckoutOpts,
): Promise<StablecoinCheckoutResult> {
  if (!Number.isFinite(opts.amountUsd) || opts.amountUsd < MIN_STABLECOIN_USD) {
    throw new Error(`Minimum payment amount is $${MIN_STABLECOIN_USD}`);
  }

  const tokenCfg = getTokenConfig(opts.token, opts.chain);

  // Convert dollars to integer cents via Credit (no floating point in billing path).
  const amountUsdCents = Credit.fromDollars(opts.amountUsd).toCentsRounded();
  const rawAmount = tokenAmountFromCents(amountUsdCents, tokenCfg.decimals);

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const derivationIndex = await deps.chargeStore.getNextDerivationIndex();
    const depositAddress = deps.deriveAddress(deps.xpub, derivationIndex, "evm");
    const referenceId = `sc:${opts.chain}:${opts.token.toLowerCase()}:${depositAddress.toLowerCase()}`;

    try {
      await deps.chargeStore.createStablecoinCharge({
        referenceId,
        tenantId: opts.tenant,
        amountUsdCents,
        chain: opts.chain,
        token: opts.token,
        depositAddress: depositAddress.toLowerCase(),
        derivationIndex,
      });

      return {
        depositAddress,
        amountRaw: rawAmount.toString(),
        amountUsd: opts.amountUsd,
        chain: opts.chain,
        token: opts.token,
        referenceId,
      };
    } catch (err: unknown) {
      // Unique constraint violation = another checkout claimed this index concurrently.
      // Retry with the next available index.
      // PostgreSQL error code 23505 = unique_violation.
      // Check structured code first, fall back to message for other drivers.
      const code = (err as { code?: string }).code;
      const isConflict = code === "23505" || (err instanceof Error && err.message.includes("unique_violation"));
      if (!isConflict || attempt === maxRetries) throw err;
    }
  }

  throw new Error("Failed to claim derivation index after retries");
}
