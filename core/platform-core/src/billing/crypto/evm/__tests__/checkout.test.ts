import { describe, expect, it, vi } from "vitest";
import { createStablecoinCheckout } from "../checkout.js";

const TEST_XPUB =
  "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";

/** Deterministic mock — returns a valid-looking EVM address for any index. */
function mockDeriveAddress(_xpub: string, index: number, _encoding: string): string {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

describe("createStablecoinCheckout", () => {
  it("derives address and creates charge", async () => {
    const mockChargeStore = {
      getNextDerivationIndex: vi.fn().mockResolvedValue(42),
      createStablecoinCharge: vi.fn().mockResolvedValue(undefined),
    };

    const result = await createStablecoinCheckout(
      { chargeStore: mockChargeStore as never, deriveAddress: mockDeriveAddress, xpub: TEST_XPUB },
      { tenant: "t1", amountUsd: 10, chain: "base", token: "USDC" },
    );

    expect(result.depositAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.amountRaw).toBe("10000000"); // 10 USDC = 10 * 10^6
    expect(result.chain).toBe("base");
    expect(result.token).toBe("USDC");
    expect(mockChargeStore.createStablecoinCharge).toHaveBeenCalledOnce();

    // Verify charge was created with integer cents, not floating point
    const chargeInput = mockChargeStore.createStablecoinCharge.mock.calls[0][0];
    expect(chargeInput.amountUsdCents).toBe(1000); // $10 = 1000 cents
    expect(Number.isInteger(chargeInput.amountUsdCents)).toBe(true);
  });

  it("rejects below minimum", async () => {
    const mockChargeStore = {
      getNextDerivationIndex: vi.fn().mockResolvedValue(0),
      createStablecoinCharge: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      createStablecoinCheckout(
        { chargeStore: mockChargeStore as never, deriveAddress: mockDeriveAddress, xpub: TEST_XPUB },
        { tenant: "t1", amountUsd: 5, chain: "base", token: "USDC" },
      ),
    ).rejects.toThrow("Minimum");
  });

  it("stores deposit address in lowercase", async () => {
    const mockChargeStore = {
      getNextDerivationIndex: vi.fn().mockResolvedValue(0),
      createStablecoinCharge: vi.fn().mockResolvedValue(undefined),
    };

    await createStablecoinCheckout(
      { chargeStore: mockChargeStore as never, deriveAddress: mockDeriveAddress, xpub: TEST_XPUB },
      { tenant: "t1", amountUsd: 10, chain: "base", token: "USDC" },
    );

    const chargeInput = mockChargeStore.createStablecoinCharge.mock.calls[0][0];
    expect(chargeInput.depositAddress).toBe(chargeInput.depositAddress.toLowerCase());
  });

  it("converts $25 correctly to raw USDC amount", async () => {
    const mockChargeStore = {
      getNextDerivationIndex: vi.fn().mockResolvedValue(0),
      createStablecoinCharge: vi.fn().mockResolvedValue(undefined),
    };

    const result = await createStablecoinCheckout(
      { chargeStore: mockChargeStore as never, deriveAddress: mockDeriveAddress, xpub: TEST_XPUB },
      { tenant: "t1", amountUsd: 25, chain: "base", token: "USDC" },
    );

    expect(result.amountRaw).toBe("25000000"); // 25 * 10^6

    const chargeInput = mockChargeStore.createStablecoinCharge.mock.calls[0][0];
    expect(chargeInput.amountUsdCents).toBe(2500);
  });
});
