import { Credit } from "../../../credits/credit.js";
import type { ICryptoChargeRepository } from "../charge-store.js";
import type { EvmChain } from "./types.js";

export const MIN_ETH_USD = 10;

/** Price oracle interface — injected from @wopr-network/platform-crypto-server. */
export interface EthPriceOracle {
  getPrice(asset: string): Promise<{ priceMicros: number }>;
}

/** Convert USD cents to native token base units (e.g. wei for ETH). */
export type CentsToNativeFn = (cents: number, priceMicros: number, decimals: number) => bigint;

export interface EthCheckoutDeps {
  chargeStore: Pick<ICryptoChargeRepository, "getNextDerivationIndex" | "createStablecoinCharge">;
  oracle: EthPriceOracle;
  /** HD key derivation function — injected from @wopr-network/platform-crypto-server. */
  deriveAddress: (xpub: string, index: number, encoding: string) => string;
  /** Convert cents to native base units — injected from @wopr-network/platform-crypto-server. */
  centsToNative: CentsToNativeFn;
  xpub: string;
}

export interface EthCheckoutOpts {
  tenant: string;
  amountUsd: number;
  chain: EvmChain;
}

export interface EthCheckoutResult {
  depositAddress: `0x${string}`;
  amountUsd: number;
  /** Expected ETH amount in wei (BigInt as string). */
  expectedWei: string;
  /** ETH price in microdollars at checkout time (10^-6 USD). */
  priceMicros: number;
  chain: EvmChain;
  referenceId: string;
}

/**
 * Create an ETH checkout — derive deposit address, lock price, store charge.
 *
 * Uses the oracle to get live ETH/USD price and compute the expected
 * deposit amount in wei. The charge stores amountUsdCents (not wei) —
 * settlement always credits the USD amount, not the ETH value.
 *
 * CRITICAL: amountUsd → integer cents via Credit.fromDollars().toCentsRounded().
 */
export async function createEthCheckout(deps: EthCheckoutDeps, opts: EthCheckoutOpts): Promise<EthCheckoutResult> {
  if (!Number.isFinite(opts.amountUsd) || opts.amountUsd < MIN_ETH_USD) {
    throw new Error(`Minimum payment amount is $${MIN_ETH_USD}`);
  }

  const amountUsdCents = Credit.fromDollars(opts.amountUsd).toCentsRounded();
  const { priceMicros } = await deps.oracle.getPrice("ETH");
  const expectedWei = deps.centsToNative(amountUsdCents, priceMicros, 18);
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const derivationIndex = await deps.chargeStore.getNextDerivationIndex();
    const depositAddress = deps.deriveAddress(deps.xpub, derivationIndex, "evm") as `0x${string}`;
    const referenceId = `eth:${opts.chain}:${depositAddress}`;

    try {
      await deps.chargeStore.createStablecoinCharge({
        referenceId,
        tenantId: opts.tenant,
        amountUsdCents,
        chain: opts.chain,
        token: "ETH",
        depositAddress,
        derivationIndex,
      });

      return {
        depositAddress,
        amountUsd: opts.amountUsd,
        expectedWei: expectedWei.toString(),
        priceMicros,
        chain: opts.chain,
        referenceId,
      };
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      const isConflict = code === "23505" || (err instanceof Error && err.message.includes("unique_violation"));
      if (!isConflict || attempt === maxRetries) throw err;
    }
  }

  throw new Error("Failed to claim derivation index after retries");
}
