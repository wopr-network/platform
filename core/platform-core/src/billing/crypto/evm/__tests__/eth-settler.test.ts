import { describe, expect, it, vi } from "vitest";
import { settleEthPayment } from "../eth-settler.js";
import type { EthPaymentEvent } from "../types.js";

function makeEvent(overrides: Partial<EthPaymentEvent> = {}): EthPaymentEvent {
  return {
    chain: "base",
    from: "0xsender",
    to: "0xdeposit",
    valueWei: "14285714285714285",
    amountUsdCents: 5000,
    txHash: "0xabc123",
    blockNumber: 100,
    confirmations: 1,
    confirmationsRequired: 1,
    ...overrides,
  };
}

function makeDeps(charge: { amountUsdCents: number; creditedAt: string | null } | null = null) {
  return {
    chargeStore: {
      getByDepositAddress: vi.fn().mockResolvedValue(
        charge
          ? {
              referenceId: "eth:base:0xdeposit",
              tenantId: "t1",
              amountUsdCents: charge.amountUsdCents,
              creditedAt: charge.creditedAt,
            }
          : null,
      ),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      markCredited: vi.fn().mockResolvedValue(undefined),
    },
    creditLedger: {
      credit: vi.fn().mockResolvedValue(undefined),
      hasReferenceId: vi.fn().mockResolvedValue(false),
    },
  };
}

describe("settleEthPayment", () => {
  it("returns Invalid for unknown deposit address", async () => {
    const deps = makeDeps(null);
    const result = await settleEthPayment(deps, makeEvent());
    expect(result.handled).toBe(false);
    expect(result.status).toBe("Invalid");
  });

  it("credits ledger for valid payment", async () => {
    const deps = makeDeps({ amountUsdCents: 5000, creditedAt: null });
    const result = await settleEthPayment(deps, makeEvent());

    expect(result.handled).toBe(true);
    expect(result.creditedCents).toBe(5000);
    expect(deps.creditLedger.credit).toHaveBeenCalledOnce();
    expect(deps.chargeStore.markCredited).toHaveBeenCalledOnce();
  });

  it("skips already-credited charge (charge-level idempotency)", async () => {
    const deps = makeDeps({ amountUsdCents: 5000, creditedAt: "2026-01-01" });
    const result = await settleEthPayment(deps, makeEvent());

    expect(result.handled).toBe(true);
    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled();
  });

  it("skips duplicate transfer (transfer-level idempotency)", async () => {
    const deps = makeDeps({ amountUsdCents: 5000, creditedAt: null });
    deps.creditLedger.hasReferenceId.mockResolvedValue(true);

    const result = await settleEthPayment(deps, makeEvent());
    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled();
  });

  it("rejects underpayment", async () => {
    const deps = makeDeps({ amountUsdCents: 10000, creditedAt: null });
    const result = await settleEthPayment(deps, makeEvent({ amountUsdCents: 5000 }));

    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled();
  });

  it("credits charge amount, not transfer amount (overpayment safe)", async () => {
    const deps = makeDeps({ amountUsdCents: 5000, creditedAt: null });
    const result = await settleEthPayment(deps, makeEvent({ amountUsdCents: 10000 }));

    expect(result.creditedCents).toBe(5000);
  });

  it("uses correct creditRef format", async () => {
    const deps = makeDeps({ amountUsdCents: 5000, creditedAt: null });
    await settleEthPayment(deps, makeEvent({ chain: "base", txHash: "0xdef" }));

    expect(deps.creditLedger.hasReferenceId).toHaveBeenCalledWith("eth:base:0xdef");
  });
});
