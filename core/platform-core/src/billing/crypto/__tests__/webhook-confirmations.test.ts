import { describe, expect, it, vi } from "vitest";
import type { KeyServerWebhookDeps, KeyServerWebhookPayload } from "../key-server-webhook.js";
import { handleKeyServerWebhook, normalizeStatus } from "../key-server-webhook.js";

function mockChargeStore(overrides: Record<string, unknown> = {}) {
  return {
    getByReferenceId: vi.fn().mockResolvedValue({
      referenceId: "btc:bc1qtest",
      tenantId: "t1",
      amountUsdCents: 5000,
      creditedAt: null,
      chain: "bitcoin",
      token: "BTC",
      ...overrides,
    }),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    markCredited: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    isCredited: vi.fn(),
    createStablecoinCharge: vi.fn(),
    getByDepositAddress: vi.fn(),
    getNextDerivationIndex: vi.fn(),
    listActiveDepositAddresses: vi.fn(),
  };
}

function mockLedger() {
  return {
    credit: vi.fn().mockResolvedValue({ id: "j1" }),
    debit: vi.fn(),
    balance: vi.fn(),
    hasReferenceId: vi.fn().mockResolvedValue(false),
    post: vi.fn(),
    expiredCredits: vi.fn(),
  };
}

function mockReplayGuard() {
  return {
    isDuplicate: vi.fn().mockResolvedValue(false),
    markSeen: vi.fn().mockResolvedValue({ eventId: "", source: "", seenAt: 0 }),
    purgeExpired: vi.fn(),
  };
}

function makeDeps(overrides: Partial<KeyServerWebhookDeps> = {}): KeyServerWebhookDeps {
  return {
    chargeStore: mockChargeStore() as never,
    creditLedger: mockLedger() as never,
    replayGuard: mockReplayGuard() as never,
    ...overrides,
  };
}

describe("normalizeStatus", () => {
  it("maps canonical statuses through unchanged", () => {
    expect(normalizeStatus("confirmed")).toBe("confirmed");
    expect(normalizeStatus("partial")).toBe("partial");
    expect(normalizeStatus("expired")).toBe("expired");
    expect(normalizeStatus("failed")).toBe("failed");
    expect(normalizeStatus("pending")).toBe("pending");
  });

  it("maps legacy BTCPay statuses to canonical", () => {
    expect(normalizeStatus("Settled")).toBe("confirmed");
    expect(normalizeStatus("Processing")).toBe("partial");
    expect(normalizeStatus("Expired")).toBe("expired");
    expect(normalizeStatus("Invalid")).toBe("failed");
    expect(normalizeStatus("New")).toBe("pending");
  });

  it("maps BTCPay event type strings to canonical", () => {
    expect(normalizeStatus("InvoiceSettled")).toBe("confirmed");
    expect(normalizeStatus("InvoiceProcessing")).toBe("partial");
    expect(normalizeStatus("InvoiceReceivedPayment")).toBe("partial");
    expect(normalizeStatus("InvoiceExpired")).toBe("expired");
    expect(normalizeStatus("InvoiceInvalid")).toBe("failed");
    expect(normalizeStatus("InvoiceCreated")).toBe("pending");
  });

  it("defaults unknown statuses to pending", () => {
    expect(normalizeStatus("SomethingWeird")).toBe("pending");
    expect(normalizeStatus("")).toBe("pending");
  });
});

describe("handleKeyServerWebhook — confirmation tracking", () => {
  it("calls updateProgress on partial payment (not just terminal)", async () => {
    const chargeStore = mockChargeStore();
    const deps = makeDeps({ chargeStore: chargeStore as never });

    const payload: KeyServerWebhookPayload = {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "partial",
      amountReceivedCents: 2500,
      confirmations: 2,
      confirmationsRequired: 6,
      txHash: "0xabc",
    };

    const result = await handleKeyServerWebhook(deps, payload);

    expect(result.handled).toBe(true);
    expect(result.status).toBe("partial");
    expect(result.confirmations).toBe(2);
    expect(result.confirmationsRequired).toBe(6);
    expect(chargeStore.updateProgress).toHaveBeenCalledWith("btc:bc1qtest", {
      status: "partial",
      amountReceivedCents: 2500,
      confirmations: 2,
      confirmationsRequired: 6,
      txHash: "0xabc",
    });
  });

  it("calls updateProgress AND credits ledger on confirmed", async () => {
    const chargeStore = mockChargeStore();
    const ledger = mockLedger();
    const deps = makeDeps({ chargeStore: chargeStore as never, creditLedger: ledger as never });

    const payload: KeyServerWebhookPayload = {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "confirmed",
      amountReceivedCents: 5000,
      confirmations: 6,
      confirmationsRequired: 6,
      txHash: "0xfinal",
    };

    const result = await handleKeyServerWebhook(deps, payload);

    expect(result.handled).toBe(true);
    expect(result.status).toBe("confirmed");
    expect(result.creditedCents).toBe(5000);
    expect(chargeStore.updateProgress).toHaveBeenCalledWith("btc:bc1qtest", {
      status: "confirmed",
      amountReceivedCents: 5000,
      confirmations: 6,
      confirmationsRequired: 6,
      txHash: "0xfinal",
    });
    expect(ledger.credit).toHaveBeenCalledOnce();
    expect(chargeStore.markCredited).toHaveBeenCalledWith("btc:bc1qtest");
  });

  it("does NOT credit ledger on partial status", async () => {
    const ledger = mockLedger();
    const deps = makeDeps({ creditLedger: ledger as never });

    await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "Processing",
      amountReceivedCents: 2500,
      confirmations: 1,
      confirmationsRequired: 6,
    });

    expect(ledger.credit).not.toHaveBeenCalled();
  });

  it("does NOT credit ledger on expired status", async () => {
    const ledger = mockLedger();
    const deps = makeDeps({ creditLedger: ledger as never });

    await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "expired",
      amountReceivedCents: 0,
      confirmations: 0,
      confirmationsRequired: 6,
    });

    expect(ledger.credit).not.toHaveBeenCalled();
  });

  it("normalizes legacy 'Settled' status to 'confirmed' and credits", async () => {
    const chargeStore = mockChargeStore();
    const ledger = mockLedger();
    const deps = makeDeps({ chargeStore: chargeStore as never, creditLedger: ledger as never });

    const result = await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "Settled",
      amountReceivedCents: 5000,
      confirmations: 6,
      confirmationsRequired: 6,
      txHash: "0xlegacy",
    });

    expect(result.status).toBe("confirmed");
    expect(ledger.credit).toHaveBeenCalledOnce();
    expect(chargeStore.updateProgress).toHaveBeenCalledWith(
      "btc:bc1qtest",
      expect.objectContaining({ status: "confirmed" }),
    );
  });

  it("deduplicates exact same chargeId + status + confirmations", async () => {
    const replayGuard = mockReplayGuard();
    replayGuard.isDuplicate.mockResolvedValue(true);
    const deps = makeDeps({ replayGuard: replayGuard as never });

    const result = await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "partial",
      confirmations: 2,
      confirmationsRequired: 6,
    });

    expect(result.duplicate).toBe(true);
  });

  it("allows same charge with different confirmation counts through", async () => {
    const replayGuard = mockReplayGuard();
    const seenKeys = new Set<string>();
    replayGuard.isDuplicate.mockImplementation(async (key: string) => seenKeys.has(key));
    replayGuard.markSeen.mockImplementation(async (key: string) => {
      seenKeys.add(key);
      return { eventId: key, source: "crypto", seenAt: 0 };
    });
    const deps = makeDeps({ replayGuard: replayGuard as never });

    const base = {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "partial",
      amountReceivedCents: 5000,
      confirmationsRequired: 6,
    };

    const r1 = await handleKeyServerWebhook(deps, { ...base, confirmations: 1 });
    const r2 = await handleKeyServerWebhook(deps, { ...base, confirmations: 2 });
    const r3 = await handleKeyServerWebhook(deps, { ...base, confirmations: 1 }); // duplicate

    expect(r1.handled).toBe(true);
    expect(r1.duplicate).toBeUndefined();
    expect(r2.handled).toBe(true);
    expect(r2.duplicate).toBeUndefined();
    expect(r3.duplicate).toBe(true);
  });

  it("supports deprecated amountUsdCents field as fallback", async () => {
    const chargeStore = mockChargeStore();
    const deps = makeDeps({ chargeStore: chargeStore as never });

    await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "partial",
      amountUsdCents: 3000,
      confirmations: 1,
      confirmationsRequired: 6,
    });

    expect(chargeStore.updateProgress).toHaveBeenCalledWith(
      "btc:bc1qtest",
      expect.objectContaining({ amountReceivedCents: 3000 }),
    );
  });

  it("prefers amountReceivedCents over deprecated amountUsdCents", async () => {
    const chargeStore = mockChargeStore();
    const deps = makeDeps({ chargeStore: chargeStore as never });

    await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "partial",
      amountReceivedCents: 4000,
      amountUsdCents: 3000,
      confirmations: 1,
      confirmationsRequired: 6,
    });

    expect(chargeStore.updateProgress).toHaveBeenCalledWith(
      "btc:bc1qtest",
      expect.objectContaining({ amountReceivedCents: 4000 }),
    );
  });

  it("returns handled: false for unknown charges", async () => {
    const chargeStore = mockChargeStore();
    chargeStore.getByReferenceId.mockResolvedValue(null);
    const deps = makeDeps({ chargeStore: chargeStore as never });

    const result = await handleKeyServerWebhook(deps, {
      chargeId: "unknown",
      chain: "bitcoin",
      address: "bc1qunknown",
      status: "partial",
    });

    expect(result.handled).toBe(false);
  });

  it("defaults confirmations to 0 and confirmationsRequired to 1 when absent", async () => {
    const chargeStore = mockChargeStore();
    const deps = makeDeps({ chargeStore: chargeStore as never });

    await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "partial",
    });

    expect(chargeStore.updateProgress).toHaveBeenCalledWith(
      "btc:bc1qtest",
      expect.objectContaining({ confirmations: 0, confirmationsRequired: 1 }),
    );
  });

  it("also calls legacy updateStatus for backward compat", async () => {
    const chargeStore = mockChargeStore();
    const deps = makeDeps({ chargeStore: chargeStore as never });

    await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "partial",
      amountReceived: "25000",
    });

    expect(chargeStore.updateStatus).toHaveBeenCalledWith("btc:bc1qtest", "Processing", "BTC", "25000");
  });

  it("calls onCreditsPurchased on confirmed and returns reactivatedBots", async () => {
    const chargeStore = mockChargeStore();
    const ledger = mockLedger();
    const onCreditsPurchased = vi.fn().mockResolvedValue(["bot-1", "bot-2"]);
    const deps = makeDeps({
      chargeStore: chargeStore as never,
      creditLedger: ledger as never,
      onCreditsPurchased,
    });

    const result = await handleKeyServerWebhook(deps, {
      chargeId: "btc:bc1qtest",
      chain: "bitcoin",
      address: "bc1qtest",
      status: "confirmed",
      confirmations: 6,
      confirmationsRequired: 6,
    });

    expect(onCreditsPurchased).toHaveBeenCalledWith("t1", ledger);
    expect(result.reactivatedBots).toEqual(["bot-1", "bot-2"]);
  });
});
