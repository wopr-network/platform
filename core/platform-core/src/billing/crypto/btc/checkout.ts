import { Credit } from "../../../credits/credit.js";
import type { ICryptoChargeRepository } from "../charge-store.js";
import type { BtcCheckoutOpts } from "./types.js";

export const MIN_BTC_USD = 10;

export interface BtcCheckoutDeps {
  chargeStore: Pick<ICryptoChargeRepository, "getNextDerivationIndex" | "createStablecoinCharge">;
  /** HD key derivation function — injected from @wopr-network/platform-crypto-server. */
  deriveAddress: (xpub: string, index: number, encoding: string, params?: { hrp?: string }) => string;
  xpub: string;
  network?: "mainnet" | "testnet" | "regtest";
}

export interface BtcCheckoutResult {
  depositAddress: string;
  amountUsd: number;
  referenceId: string;
}

/**
 * Create a BTC checkout — derive a unique deposit address, store the charge.
 *
 * Same pattern as stablecoin checkout: HD derivation + charge store + retry on conflict.
 *
 * CRITICAL: amountUsd → integer cents via Credit.fromDollars().toCentsRounded().
 */
export async function createBtcCheckout(deps: BtcCheckoutDeps, opts: BtcCheckoutOpts): Promise<BtcCheckoutResult> {
  if (!Number.isFinite(opts.amountUsd) || opts.amountUsd < MIN_BTC_USD) {
    throw new Error(`Minimum payment amount is $${MIN_BTC_USD}`);
  }

  const amountUsdCents = Credit.fromDollars(opts.amountUsd).toCentsRounded();
  const network = deps.network ?? "mainnet";
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const derivationIndex = await deps.chargeStore.getNextDerivationIndex();
    const hrpMap = { mainnet: "bc", testnet: "tb", regtest: "bcrt" } as const;
    const depositAddress = deps.deriveAddress(deps.xpub, derivationIndex, "bech32", {
      hrp: hrpMap[network],
    });
    const referenceId = `btc:${depositAddress}`;

    try {
      await deps.chargeStore.createStablecoinCharge({
        referenceId,
        tenantId: opts.tenant,
        amountUsdCents,
        chain: "bitcoin",
        token: "BTC",
        depositAddress,
        derivationIndex,
      });

      return { depositAddress, amountUsd: opts.amountUsd, referenceId };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      const isConflict = code === "23505" || (err instanceof Error && err.message.includes("unique_violation"));
      if (!isConflict || attempt === maxRetries) throw err;
    }
  }

  throw new Error("Failed to claim derivation index after retries");
}
