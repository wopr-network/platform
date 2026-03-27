import { describe, expect, it, vi } from "vitest";
import { createEthCheckout, MIN_ETH_USD } from "../eth-checkout.js";

const mockOracle = { getPrice: vi.fn().mockResolvedValue({ priceMicros: 3_500_000_000, updatedAt: new Date() }) };

/** Deterministic mock — returns a valid-looking EVM address for any index. */
function mockDeriveAddress(_xpub: string, index: number, _encoding: string): string {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

/**
 * centsToNative: Convert USD cents to native token base units.
 * Formula: (cents * 10_000 * 10^decimals) / priceMicros
 * This mirrors the real oracle/convert.ts logic.
 */
function mockCentsToNative(cents: number, priceMicros: number, decimals: number): bigint {
  return (BigInt(cents) * 10_000n * 10n ** BigInt(decimals)) / BigInt(priceMicros);
}

function makeDeps(derivationIndex = 0) {
  return {
    chargeStore: {
      getNextDerivationIndex: vi.fn().mockResolvedValue(derivationIndex),
      createStablecoinCharge: vi.fn().mockResolvedValue(undefined),
    },
    oracle: mockOracle,
    deriveAddress: mockDeriveAddress,
    centsToNative: mockCentsToNative,
    xpub: "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8",
  };
}

describe("createEthCheckout", () => {
  it("creates checkout with oracle-derived expected wei", async () => {
    const deps = makeDeps();
    const result = await createEthCheckout(deps, { tenant: "t1", amountUsd: 50, chain: "base" });

    expect(result.amountUsd).toBe(50);
    expect(result.priceMicros).toBe(3_500_000_000);
    expect(result.chain).toBe("base");
    // $50 = 5000 cents * 10000 micros/cent * 10^18 / 3_500_000_000 micros = 14285714285714285n
    expect(result.expectedWei).toBe("14285714285714285");
    expect(result.depositAddress).toMatch(/^0x/);
    expect(result.referenceId).toMatch(/^eth:base:0x/);
  });

  it("rejects amount below minimum", async () => {
    const deps = makeDeps();
    await expect(createEthCheckout(deps, { tenant: "t1", amountUsd: 5, chain: "base" })).rejects.toThrow(
      `Minimum payment amount is $${MIN_ETH_USD}`,
    );
  });

  it("retries on unique constraint violation", async () => {
    const deps = makeDeps();
    deps.chargeStore.createStablecoinCharge
      .mockRejectedValueOnce(Object.assign(new Error("unique_violation"), { code: "23505" }))
      .mockResolvedValueOnce(undefined);
    deps.chargeStore.getNextDerivationIndex.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const result = await createEthCheckout(deps, { tenant: "t1", amountUsd: 50, chain: "base" });
    expect(result.depositAddress).toMatch(/^0x/);
    expect(deps.chargeStore.createStablecoinCharge).toHaveBeenCalledTimes(2);
  });

  it("stores amountUsdCents as integer cents", async () => {
    const deps = makeDeps();
    await createEthCheckout(deps, { tenant: "t1", amountUsd: 50, chain: "base" });

    const call = deps.chargeStore.createStablecoinCharge.mock.calls[0][0];
    expect(call.amountUsdCents).toBe(5000);
    expect(Number.isInteger(call.amountUsdCents)).toBe(true);
    expect(call.token).toBe("ETH");
    expect(call.chain).toBe("base");
  });
});
