import { describe, expect, it, vi } from "vitest";
import type { CryptoServiceClient } from "../client.js";
import { createUnifiedCheckout, MIN_CHECKOUT_USD } from "../unified-checkout.js";

function mockCryptoService(): CryptoServiceClient {
  return {
    createCharge: vi.fn().mockResolvedValue({
      chargeId: "btc:bc1qtest",
      address: "bc1qtest",
      chain: "bitcoin",
      token: "BTC",
      amountUsd: 50,
      displayAmount: "0.00076923 BTC",
      derivationIndex: 7,
      expiresAt: "2026-03-21T23:00:00Z",
    }),
    listChains: vi.fn(),
    deriveAddress: vi.fn(),
    getCharge: vi.fn(),
  } as unknown as CryptoServiceClient;
}

describe("createUnifiedCheckout", () => {
  it("delegates to CryptoServiceClient.createCharge", async () => {
    const service = mockCryptoService();
    const result = await createUnifiedCheckout({ cryptoService: service }, "btc", { tenant: "t-1", amountUsd: 50 });

    expect(result.depositAddress).toBe("bc1qtest");
    expect(result.displayAmount).toBe("0.00076923 BTC");
    expect(result.amountUsd).toBe(50);
    expect(result.token).toBe("BTC");
    expect(result.chain).toBe("bitcoin");
    expect(result.referenceId).toBe("btc:bc1qtest");

    expect(service.createCharge).toHaveBeenCalledWith({
      chain: "btc",
      amountUsd: 50,
      callbackUrl: undefined,
    });
  });

  it("passes callbackUrl to createCharge", async () => {
    const service = mockCryptoService();
    await createUnifiedCheckout({ cryptoService: service }, "base-usdc", {
      tenant: "t-1",
      amountUsd: 25,
      callbackUrl: "https://example.com/hook",
    });

    expect(service.createCharge).toHaveBeenCalledWith({
      chain: "base-usdc",
      amountUsd: 25,
      callbackUrl: "https://example.com/hook",
    });
  });

  it("rejects amount below minimum", async () => {
    const service = mockCryptoService();
    await expect(
      createUnifiedCheckout({ cryptoService: service }, "btc", { tenant: "t-1", amountUsd: 5 }),
    ).rejects.toThrow(`Minimum payment amount is $${MIN_CHECKOUT_USD}`);

    expect(service.createCharge).not.toHaveBeenCalled();
  });

  it("rejects non-finite amount", async () => {
    const service = mockCryptoService();
    await expect(
      createUnifiedCheckout({ cryptoService: service }, "btc", { tenant: "t-1", amountUsd: NaN }),
    ).rejects.toThrow(`Minimum payment amount is $${MIN_CHECKOUT_USD}`);
  });

  it("propagates createCharge errors", async () => {
    const service = mockCryptoService();
    (service.createCharge as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("CryptoService createCharge failed (500): Internal Server Error"),
    );

    await expect(
      createUnifiedCheckout({ cryptoService: service }, "btc", { tenant: "t-1", amountUsd: 50 }),
    ).rejects.toThrow("CryptoService createCharge failed (500)");
  });
});
