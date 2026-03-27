import { describe, expect, it, vi } from "vitest";
import { settleEvmPayment } from "../settler.js";
import type { EvmPaymentEvent } from "../types.js";

const mockEvent: EvmPaymentEvent = {
  chain: "base",
  token: "USDC",
  from: "0xsender",
  to: "0xdeposit",
  rawAmount: "10000000", // 10 USDC
  amountUsdCents: 1000,
  txHash: "0xtx123",
  blockNumber: 100,
  logIndex: 0,
  confirmations: 1,
  confirmationsRequired: 1,
};

describe("settleEvmPayment", () => {
  it("credits ledger when charge found and not yet credited", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:base:usdc:abc",
          tenantId: "tenant-1",
          amountUsdCents: 1000,
          status: "New",
          creditedAt: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn().mockResolvedValue({}),
      },
      onCreditsPurchased: vi.fn().mockResolvedValue([]),
    };

    const result = await settleEvmPayment(deps as never, mockEvent);

    expect(result.handled).toBe(true);
    expect(result.creditedCents).toBe(1000);
    expect(deps.creditLedger.credit).toHaveBeenCalledOnce();
    expect(deps.chargeStore.markCredited).toHaveBeenCalledOnce();

    // Verify Credit.fromCents was used (credit is called with a Credit object, not raw cents)
    const creditArg = deps.creditLedger.credit.mock.calls[0][1];
    expect(creditArg.toCentsRounded()).toBe(1000);
  });

  it("skips crediting when already credited (idempotent)", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:base:usdc:abc",
          tenantId: "tenant-1",
          amountUsdCents: 1000,
          status: "Settled",
          creditedAt: "2026-01-01",
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(true),
        credit: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await settleEvmPayment(deps as never, mockEvent);

    expect(result.handled).toBe(true);
    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled();
  });

  it("returns handled:false when no charge found for deposit address", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue(null),
        updateStatus: vi.fn(),
        markCredited: vi.fn(),
      },
      creditLedger: { hasReferenceId: vi.fn(), credit: vi.fn() },
    };

    const result = await settleEvmPayment(deps as never, mockEvent);
    expect(result.handled).toBe(false);
  });

  it("credits the charge amount, not the transfer amount (overpayment safe)", async () => {
    const overpaidEvent = { ...mockEvent, amountUsdCents: 2000 }; // sent $20
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:x",
          tenantId: "t",
          amountUsdCents: 1000, // charge was for $10
          status: "New",
          creditedAt: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn().mockResolvedValue({}),
      },
      onCreditsPurchased: vi.fn().mockResolvedValue([]),
    };

    const result = await settleEvmPayment(deps as never, overpaidEvent);
    expect(result.creditedCents).toBe(1000); // charge amount, NOT transfer amount
  });

  it("rejects underpayment — does not credit if transfer < charge", async () => {
    const underpaidEvent = { ...mockEvent, amountUsdCents: 500 }; // sent $5
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:x",
          tenantId: "t",
          amountUsdCents: 1000, // charge was for $10
          status: "New",
          creditedAt: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await settleEvmPayment(deps as never, underpaidEvent);
    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled();
  });

  it("uses correct ledger referenceId format", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:ref",
          tenantId: "t",
          amountUsdCents: 500,
          status: "New",
          creditedAt: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn().mockResolvedValue({}),
      },
      onCreditsPurchased: vi.fn().mockResolvedValue([]),
    };

    await settleEvmPayment(deps as never, mockEvent);

    const creditOpts = deps.creditLedger.credit.mock.calls[0][3];
    expect(creditOpts.referenceId).toBe("evm:base:0xtx123:0");
    expect(creditOpts.fundingSource).toBe("crypto");
  });

  it("calls onCreditsPurchased when provided", async () => {
    const onPurchased = vi.fn().mockResolvedValue(["bot-1", "bot-2"]);
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:ref",
          tenantId: "t",
          amountUsdCents: 500,
          status: "New",
          creditedAt: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn().mockResolvedValue({}),
      },
      onCreditsPurchased: onPurchased,
    };

    const result = await settleEvmPayment(deps as never, mockEvent);
    expect(onPurchased).toHaveBeenCalledOnce();
    expect(result.reactivatedBots).toEqual(["bot-1", "bot-2"]);
  });

  it("rejects second transfer to already-credited charge (no double-credit)", async () => {
    const secondTxEvent = { ...mockEvent, txHash: "0xsecondtx", logIndex: 0 };
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "sc:base:usdc:abc",
          tenantId: "tenant-1",
          amountUsdCents: 1000,
          status: "Settled",
          creditedAt: "2026-01-01T00:00:00Z", // already credited by first tx
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn().mockResolvedValue(undefined),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false), // new txHash, so this returns false
        credit: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await settleEvmPayment(deps as never, secondTxEvent);
    expect(result.handled).toBe(true);
    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled(); // must NOT double-credit
  });
});
