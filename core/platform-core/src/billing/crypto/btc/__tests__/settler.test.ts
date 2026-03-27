import { describe, expect, it, vi } from "vitest";
import { settleBtcPayment } from "../settler.js";
import type { BtcPaymentEvent } from "../types.js";

const mockEvent: BtcPaymentEvent = {
  address: "bc1qtest",
  txid: "abc123",
  amountSats: 15000,
  amountUsdCents: 1000,
  confirmations: 6,
  confirmationsRequired: 6,
};

describe("settleBtcPayment", () => {
  it("credits ledger when charge found", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "btc:test",
          tenantId: "t1",
          amountUsdCents: 1000,
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

    const result = await settleBtcPayment(deps as never, mockEvent);
    expect(result.handled).toBe(true);
    expect(result.creditedCents).toBe(1000);
    expect(deps.creditLedger.credit).toHaveBeenCalledOnce();

    // Verify Credit.fromCents was used
    const creditArg = deps.creditLedger.credit.mock.calls[0][1];
    expect(creditArg.toCentsRounded()).toBe(1000);
  });

  it("rejects double-credit on already-credited charge", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "btc:test",
          tenantId: "t1",
          amountUsdCents: 1000,
          creditedAt: "2026-01-01",
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn(),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn(),
      },
    };

    const result = await settleBtcPayment(deps as never, mockEvent);
    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled();
  });

  it("rejects underpayment", async () => {
    const underpaid = { ...mockEvent, amountUsdCents: 500 };
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue({
          referenceId: "btc:test",
          tenantId: "t1",
          amountUsdCents: 1000,
          creditedAt: null,
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
        markCredited: vi.fn(),
      },
      creditLedger: {
        hasReferenceId: vi.fn().mockResolvedValue(false),
        credit: vi.fn(),
      },
    };

    const result = await settleBtcPayment(deps as never, underpaid);
    expect(result.creditedCents).toBe(0);
    expect(deps.creditLedger.credit).not.toHaveBeenCalled();
  });

  it("returns handled:false when no charge found", async () => {
    const deps = {
      chargeStore: {
        getByDepositAddress: vi.fn().mockResolvedValue(null),
        updateStatus: vi.fn(),
        markCredited: vi.fn(),
      },
      creditLedger: { hasReferenceId: vi.fn(), credit: vi.fn() },
    };

    const result = await settleBtcPayment(deps as never, mockEvent);
    expect(result.handled).toBe(false);
  });
});
