/**
 * Unit tests for the monetization crypto webhook handler.
 *
 * This handler is the WOPR-specific layer on top of the platform-core
 * billing/crypto key-server webhook. Key differences from billing layer:
 *  - Uses BotBilling.checkReactivation() instead of onCreditsPurchased callback
 *  - Imports charge store / replay guard types from billing layer (relative)
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CryptoChargeRepository } from "../../../billing/crypto/charge-store.js";
import type { CryptoWebhookPayload } from "../../../billing/crypto/index.js";
import { DrizzleWebhookSeenRepository } from "../../../billing/drizzle-webhook-seen-repository.js";
import { noOpReplayGuard } from "../../../billing/webhook-seen-repository.js";
import { DrizzleLedger } from "../../../credits/ledger.js";
import { createTestDb, truncateAllTables } from "../../../test/db.js";
import type { BotBilling } from "../../credits/bot-billing.js";
import type { CryptoWebhookDeps } from "../webhook.js";
import { handleCryptoWebhook } from "../webhook.js";

function makePayload(overrides: Partial<CryptoWebhookPayload> = {}): CryptoWebhookPayload {
  return {
    chargeId: "chg-test-001",
    chain: "bitcoin",
    address: "bc1q-test-address",
    amountUsdCents: 2500,
    status: "confirmed",
    txHash: "tx-abc123",
    ...overrides,
  };
}

let pool: PGlite;
let db: Awaited<ReturnType<typeof createTestDb>>["db"];

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

describe("handleCryptoWebhook (monetization layer)", () => {
  let chargeStore: CryptoChargeRepository;
  let creditLedger: DrizzleLedger;
  let deps: CryptoWebhookDeps;

  beforeEach(async () => {
    await truncateAllTables(pool);
    chargeStore = new CryptoChargeRepository(db);
    creditLedger = new DrizzleLedger(db);
    await creditLedger.seedSystemAccounts();
    deps = { chargeStore, creditLedger, replayGuard: noOpReplayGuard };

    // Default test charge: $25 = 2500 cents
    await chargeStore.create("chg-test-001", "tenant-a", 2500);
  });

  // ---------------------------------------------------------------------------
  // confirmed — credits ledger
  // ---------------------------------------------------------------------------

  describe("confirmed status", () => {
    it("credits the ledger with the USD amount in cents", async () => {
      const result = await handleCryptoWebhook(deps, makePayload({ status: "confirmed" }));

      expect(result.handled).toBe(true);
      expect(result.tenant).toBe("tenant-a");
      expect(result.creditedCents).toBe(2500);

      const balance = await creditLedger.balance("tenant-a");
      expect(balance.toCents()).toBe(2500);
    });

    it("marks the charge as credited after confirmation", async () => {
      await handleCryptoWebhook(deps, makePayload({ status: "confirmed" }));
      expect(await chargeStore.isCredited("chg-test-001")).toBe(true);
    });

    it("uses crypto: prefix on reference ID in ledger entry", async () => {
      await handleCryptoWebhook(deps, makePayload({ status: "confirmed" }));

      const history = await creditLedger.history("tenant-a");
      expect(history).toHaveLength(1);
      expect(history[0].referenceId).toBe("crypto:chg-test-001");
      expect(history[0].entryType).toBe("purchase");
    });

    it("records fundingSource as crypto", async () => {
      await handleCryptoWebhook(deps, makePayload({ status: "confirmed" }));

      const history = await creditLedger.history("tenant-a");
      expect(history[0].metadata?.fundingSource).toBe("crypto");
    });

    it("is idempotent — second confirmed does not double-credit", async () => {
      await handleCryptoWebhook(deps, makePayload({ status: "confirmed" }));
      const result2 = await handleCryptoWebhook(deps, makePayload({ status: "confirmed" }));

      expect(result2.handled).toBe(true);
      expect(result2.creditedCents).toBeUndefined();

      // Balance is still $25, not $50
      const balance = await creditLedger.balance("tenant-a");
      expect(balance.toCents()).toBe(2500);
    });
  });

  // ---------------------------------------------------------------------------
  // Non-confirmed statuses — no ledger credit
  // ---------------------------------------------------------------------------

  describe("pending status", () => {
    it("does NOT credit the ledger", async () => {
      const result = await handleCryptoWebhook(deps, makePayload({ status: "pending" }));

      expect(result.handled).toBe(true);
      expect(result.tenant).toBe("tenant-a");
      expect(result.creditedCents).toBeUndefined();
      expect((await creditLedger.balance("tenant-a")).toCents()).toBe(0);
    });
  });

  describe("expired status", () => {
    it("does NOT credit the ledger", async () => {
      const result = await handleCryptoWebhook(deps, makePayload({ status: "expired" }));

      expect(result.handled).toBe(true);
      expect(result.creditedCents).toBeUndefined();
      expect((await creditLedger.balance("tenant-a")).toCents()).toBe(0);
    });
  });

  describe("failed status", () => {
    it("does NOT credit the ledger", async () => {
      const result = await handleCryptoWebhook(deps, makePayload({ status: "failed" }));

      expect(result.handled).toBe(true);
      expect(result.creditedCents).toBeUndefined();
      expect((await creditLedger.balance("tenant-a")).toCents()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown chargeId — returns handled:false
  // ---------------------------------------------------------------------------

  describe("missing charge", () => {
    it("returns handled:false when chargeId is not in the charge store", async () => {
      const result = await handleCryptoWebhook(deps, makePayload({ chargeId: "chg-unknown-999" }));

      expect(result.handled).toBe(false);
      expect(result.tenant).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Charge store status updates
  // ---------------------------------------------------------------------------

  describe("charge store updates", () => {
    it("updates charge status on every webhook call", async () => {
      await handleCryptoWebhook(deps, makePayload({ status: "partial" }));

      const charge = await chargeStore.getByReferenceId("chg-test-001");
      // DB stores legacy status values; "partial" maps to "Processing" internally
      expect(charge?.status).toBe("Processing");
    });

    it("settles charge when status is confirmed", async () => {
      await handleCryptoWebhook(deps, makePayload({ status: "confirmed" }));

      const charge = await chargeStore.getByReferenceId("chg-test-001");
      expect(charge?.status).toBe("Settled");
    });
  });

  // ---------------------------------------------------------------------------
  // Replay guard / idempotency
  // ---------------------------------------------------------------------------

  describe("replay guard", () => {
    it("blocks duplicate chargeId via ks: dedupe key", async () => {
      const replayGuard = new DrizzleWebhookSeenRepository(db);
      const depsWithGuard: CryptoWebhookDeps = { ...deps, replayGuard };

      const first = await handleCryptoWebhook(depsWithGuard, makePayload({ status: "confirmed" }));
      expect(first.handled).toBe(true);
      expect(first.creditedCents).toBe(2500);
      expect(first.duplicate).toBeUndefined();

      const second = await handleCryptoWebhook(depsWithGuard, makePayload({ status: "confirmed" }));
      expect(second.handled).toBe(true);
      expect(second.duplicate).toBe(true);
      expect(second.creditedCents).toBeUndefined();

      // Balance is still $25, not $50
      expect((await creditLedger.balance("tenant-a")).toCents()).toBe(2500);
    });
  });

  // ---------------------------------------------------------------------------
  // BotBilling reactivation — WOPR-specific behaviour
  // ---------------------------------------------------------------------------

  describe("BotBilling reactivation", () => {
    it("calls botBilling.checkReactivation on confirmed and returns reactivatedBots", async () => {
      const mockBotBilling = {
        checkReactivation: vi.fn().mockResolvedValue(["bot-1", "bot-2"]),
      } as unknown as BotBilling;
      const depsWithBots: CryptoWebhookDeps = { ...deps, botBilling: mockBotBilling };

      const result = await handleCryptoWebhook(depsWithBots, makePayload({ status: "confirmed" }));

      expect(mockBotBilling.checkReactivation).toHaveBeenCalledWith("tenant-a", creditLedger);
      expect(result.reactivatedBots).toEqual(["bot-1", "bot-2"]);
    });

    it("omits reactivatedBots when no bots are reactivated", async () => {
      const mockBotBilling = {
        checkReactivation: vi.fn().mockResolvedValue([]),
      } as unknown as BotBilling;
      const depsWithBots: CryptoWebhookDeps = { ...deps, botBilling: mockBotBilling };

      const result = await handleCryptoWebhook(depsWithBots, makePayload({ status: "confirmed" }));

      expect(result.reactivatedBots).toBeUndefined();
    });

    it("does NOT call botBilling on non-confirmed statuses", async () => {
      const mockBotBilling = {
        checkReactivation: vi.fn().mockResolvedValue(["bot-1"]),
      } as unknown as BotBilling;
      const depsWithBots: CryptoWebhookDeps = { ...deps, botBilling: mockBotBilling };

      await handleCryptoWebhook(depsWithBots, makePayload({ status: "pending" }));

      expect(mockBotBilling.checkReactivation).not.toHaveBeenCalled();
    });

    it("does NOT call botBilling when charge is already credited (idempotency path)", async () => {
      const mockBotBilling = {
        checkReactivation: vi.fn().mockResolvedValue(["bot-1"]),
      } as unknown as BotBilling;
      const depsWithBots: CryptoWebhookDeps = { ...deps, botBilling: mockBotBilling };

      // First confirmation — should call reactivation
      await handleCryptoWebhook(depsWithBots, makePayload({ status: "confirmed" }));
      expect(mockBotBilling.checkReactivation).toHaveBeenCalledTimes(1);

      // Second confirmation — charge already credited, should NOT call reactivation again
      await handleCryptoWebhook(depsWithBots, makePayload({ status: "confirmed" }));
      expect(mockBotBilling.checkReactivation).toHaveBeenCalledTimes(1);
    });

    it("operates correctly when botBilling is not provided", async () => {
      // No botBilling dependency — should complete without error
      const result = await handleCryptoWebhook(deps, makePayload({ status: "confirmed" }));

      expect(result.handled).toBe(true);
      expect(result.creditedCents).toBe(2500);
      expect(result.reactivatedBots).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple tenants — independent processing
  // ---------------------------------------------------------------------------

  describe("multiple tenants", () => {
    it("processes charges for different tenants independently", async () => {
      await chargeStore.create("chg-b-001", "tenant-b", 5000);
      await chargeStore.create("chg-c-001", "tenant-c", 1500);

      await handleCryptoWebhook(deps, makePayload({ chargeId: "chg-b-001", status: "confirmed" }));
      await handleCryptoWebhook(deps, makePayload({ chargeId: "chg-c-001", status: "confirmed" }));

      expect((await creditLedger.balance("tenant-b")).toCents()).toBe(5000);
      expect((await creditLedger.balance("tenant-c")).toCents()).toBe(1500);
      // Original tenant-a was not confirmed in this test
      expect((await creditLedger.balance("tenant-a")).toCents()).toBe(0);
    });
  });
});
