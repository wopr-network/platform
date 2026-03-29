import type { PGlite } from "@electric-sql/pglite";
import { Credit, DrizzleLedger, InsufficientBalanceError } from "@wopr-network/platform-core/credits";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RESOURCE_TIERS } from "../../fleet/resource-tiers.js";
import { createTestDb, truncateAllTables } from "../../test/db.js";
import { buildResourceTierCosts, DAILY_BOT_COST, dailyBotCost, runRuntimeDeductions } from "./runtime-cron.js";

describe("runRuntimeDeductions", () => {
  const TODAY = "2025-01-01";
  /** Dynamic daily cost for TODAY's month (January = 31 days) */
  const COST = dailyBotCost(TODAY);
  let pool: PGlite;
  let ledger: DrizzleLedger;

  beforeAll(async () => {
    const { db, pool: p } = await createTestDb();
    pool = p;
    ledger = new DrizzleLedger(db);
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    await ledger.seedSystemAccounts();
  });

  it("DAILY_BOT_COST equals 17 cents", () => {
    expect(DAILY_BOT_COST.toCentsRounded()).toBe(17);
  });

  it("returns empty result when no tenants have balance", async () => {
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 0,
    });
    expect(result.processed).toBe(0);
    expect(result.suspended).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("skips tenants with zero active bots", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 0,
    });
    expect(result.processed).toBe(0);
    expect((await ledger.balance("tenant-1")).toCents()).toBe(500);
  });

  it("deducts full amount when balance is sufficient", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 2,
    });
    expect(result.processed).toBe(1);
    expect(result.suspended).toEqual([]);
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(
      Credit.fromCents(500).subtract(COST.multiply(2)).toCentsRounded(),
    );
  });

  it("partial deduction and suspension when balance is insufficient", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(10), "purchase", { description: "top-up" });
    const onSuspend = vi.fn();
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onSuspend,
    });
    expect(result.processed).toBe(1);
    expect(result.suspended).toContain("tenant-1");
    expect(onSuspend).toHaveBeenCalledWith("tenant-1");
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);
  });

  it("suspends with zero partial when balance exactly zero", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(100), "purchase", { description: "top-up" });
    await ledger.debit("tenant-1", Credit.fromCents(100), "bot_runtime", { description: "drain" });
    await ledger.credit("tenant-1", Credit.fromCents(1), "purchase", { description: "tiny" });

    const onSuspend = vi.fn();
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onSuspend,
    });
    expect(result.suspended).toContain("tenant-1");
    expect(onSuspend).toHaveBeenCalledWith("tenant-1");
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);
  });

  it("suspends without onSuspend callback", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(5), "purchase", { description: "top-up" });
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
    });
    expect(result.suspended).toContain("tenant-1");
    expect(result.processed).toBe(1);
  });

  it("handles errors from getActiveBotCount gracefully", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => {
        throw new Error("db connection failed");
      },
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("tenant-1");
    expect(result.errors[0]).toContain("db connection failed");
  });

  it("handles InsufficientBalanceError from ledger.debit", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    await ledger.debit("tenant-1", Credit.fromCents(499), "bot_runtime", { description: "drain" });
    const onSuspend = vi.fn();
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onSuspend,
    });
    expect(result.suspended).toContain("tenant-1");
    expect(onSuspend).toHaveBeenCalledWith("tenant-1");
  });

  it("catches InsufficientBalanceError from debit and suspends", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    vi.spyOn(ledger, "debit").mockRejectedValue(new InsufficientBalanceError(Credit.fromCents(0), COST));
    const onSuspend = vi.fn();
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onSuspend,
    });
    expect(result.suspended).toContain("tenant-1");
    expect(onSuspend).toHaveBeenCalledWith("tenant-1");
    expect(result.processed).toBe(1);
    vi.restoreAllMocks();
  });

  it("catches InsufficientBalanceError without onSuspend callback", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    vi.spyOn(ledger, "debit").mockRejectedValue(new InsufficientBalanceError(Credit.fromCents(0), COST));
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
    });
    expect(result.suspended).toContain("tenant-1");
    expect(result.processed).toBe(1);
    vi.restoreAllMocks();
  });

  it("processes multiple tenants", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    await ledger.credit("tenant-2", Credit.fromCents(10), "purchase", { description: "top-up" });
    const onSuspend = vi.fn();
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onSuspend,
    });
    expect(result.processed).toBe(2);
    expect(result.suspended).toContain("tenant-2");
    expect(result.suspended).not.toContain("tenant-1");
  });

  it("fires onLowBalance when balance drops below 100 cents threshold", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(110), "purchase", { description: "top-up" });
    const onLowBalance = vi.fn();
    await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onLowBalance,
    });
    expect(onLowBalance).toHaveBeenCalledOnce();
    const [calledTenant, calledBalance] = onLowBalance.mock.calls[0];
    expect(calledTenant).toBe("tenant-1");
    expect(calledBalance.toCentsRounded()).toBe(Credit.fromCents(110).subtract(COST).toCentsRounded());
  });

  it("does NOT fire onLowBalance when balance was already below threshold before deduction", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(90), "purchase", { description: "top-up" });
    const onLowBalance = vi.fn();
    await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onLowBalance,
    });
    expect(onLowBalance).not.toHaveBeenCalled();
  });

  it("fires onCreditsExhausted when full deduction causes balance to drop to 0", async () => {
    await ledger.credit("tenant-1", COST, "purchase", { description: "top-up" });
    const onCreditsExhausted = vi.fn();
    await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onCreditsExhausted,
    });
    expect(onCreditsExhausted).toHaveBeenCalledWith("tenant-1");
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);
  });

  it("suspends tenant when full deduction causes balance to drop to exactly 0", async () => {
    // Balance = exactly 1 bot * dailyBotCost → full deduction → 0
    await ledger.credit("tenant-1", COST, "purchase", { description: "top-up" });
    const onSuspend = vi.fn();
    const onCreditsExhausted = vi.fn();
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onSuspend,
      onCreditsExhausted,
    });
    expect(result.suspended).toContain("tenant-1");
    expect(onSuspend).toHaveBeenCalledWith("tenant-1");
    expect(onCreditsExhausted).toHaveBeenCalledWith("tenant-1");
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);
  });

  it("fires onCreditsExhausted on partial deduction when balance hits 0", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(10), "purchase", { description: "top-up" });
    const onCreditsExhausted = vi.fn();
    await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      onCreditsExhausted,
    });
    expect(onCreditsExhausted).toHaveBeenCalledWith("tenant-1");
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);
  });

  it("partially debits resource tier surcharge when balance is positive but insufficient", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(30), "purchase", { description: "top-up" });
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      getResourceTierCosts: async () => Credit.fromCents(50),
    });
    expect(result.processed).toBe(1);
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);
  });

  it("skips resource tier partial debit when balance is exactly 0 after runtime", async () => {
    await ledger.credit("tenant-1", COST, "purchase", { description: "top-up" });
    const onCreditsExhausted = vi.fn();
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      getResourceTierCosts: async () => Credit.fromCents(50),
      onCreditsExhausted,
    });
    expect(result.processed).toBe(1);
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);
    expect(onCreditsExhausted).toHaveBeenCalledWith("tenant-1");
  });

  it("storage tier else-branch does not double-suspend when runtime already suspended", async () => {
    // tenant has exactly 17 cents — runtime deduction (17 cents) brings balance to exactly 0,
    // triggering the zero-crossing suspend in the runtime block.
    // Storage cost (5 cents) then tries to suspend again via its else-branch (balance 0 < 5).
    // The !result.suspended.includes(tenantId) guard must prevent onSuspend being called twice.
    await ledger.credit("tenant-1", COST, "purchase", { description: "top-up" });
    const onSuspend = vi.fn();
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      getStorageTierCosts: async () => Credit.fromCents(5),
      onSuspend,
    });
    expect(result.suspended).toContain("tenant-1");
    expect(result.suspended.filter((id) => id === "tenant-1")).toHaveLength(1);
    expect(onSuspend).toHaveBeenCalledTimes(1);
  });

  it("buildResourceTierCosts: deducts pro tier surcharge via getResourceTierCosts", async () => {
    const proTierCost = RESOURCE_TIERS.pro.dailyCost;
    const startCredit = COST.add(proTierCost).add(Credit.fromCents(10));
    await ledger.credit("tenant-1", startCredit, "purchase", { description: "top-up" });

    const mockRepo = {
      getResourceTier: async (_botId: string): Promise<string | null> => "pro",
    };

    const getResourceTierCosts = buildResourceTierCosts(
      mockRepo as unknown as Parameters<typeof buildResourceTierCosts>[0],
      async (_tenantId: string) => ["bot-1"],
    );

    await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      getResourceTierCosts,
    });

    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(10);
  });

  it("treats unique constraint violation from concurrent debit as already-billed (skip, not error)", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    const uniqueErr = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    vi.spyOn(ledger, "debit").mockRejectedValueOnce(uniqueErr);
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
    });
    expect(result.skipped).toContain("tenant-1");
    expect(result.errors).toHaveLength(0);
    vi.restoreAllMocks();
  });

  it("is idempotent — second run on same date does not double-deduct", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "top-up" });
    const JUNE_DATE = "2025-06-15";
    const JUNE_COST = dailyBotCost(JUNE_DATE);
    const expectedBalance = Credit.fromCents(500).subtract(JUNE_COST);
    const cfg = {
      ledger,
      getActiveBotCount: async () => 1,
      date: JUNE_DATE,
    };

    const first = await runRuntimeDeductions(cfg);
    expect(first.processed).toBe(1);
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(expectedBalance.toCentsRounded());

    const second = await runRuntimeDeductions(cfg);
    expect(second.processed).toBe(0);
    expect(second.skipped).toContain("tenant-1");
    // Balance unchanged after second run
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(expectedBalance.toCentsRounded());
  });

  it("bills surcharges on retry when runtime was already billed (crash recovery)", async () => {
    // Setup: tenant with enough balance for runtime + tier + storage + addon
    await ledger.credit("tenant-1", Credit.fromCents(1000), "purchase", { description: "top-up" });
    const JUL_DATE = "2025-07-01";
    const JUL_COST = dailyBotCost(JUL_DATE);

    const cfg = {
      ledger,
      date: JUL_DATE,
      getActiveBotCount: async () => 1,
      getResourceTierCosts: async () => Credit.fromCents(10),
      getStorageTierCosts: async () => Credit.fromCents(8),
      getAddonCosts: async () => Credit.fromCents(5),
    };

    // First run — bills everything
    const first = await runRuntimeDeductions(cfg);
    expect(first.processed).toBe(1);
    const expectedAfterFirst = Credit.fromCents(1000)
      .subtract(JUL_COST)
      .subtract(Credit.fromCents(10))
      .subtract(Credit.fromCents(8))
      .subtract(Credit.fromCents(5));
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(expectedAfterFirst.toCentsRounded());

    // Second run — all already billed, should skip
    const second = await runRuntimeDeductions(cfg);
    expect(second.skipped).toContain("tenant-1");
    expect(second.processed).toBe(0);
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(expectedAfterFirst.toCentsRounded());
  });

  it("bills remaining surcharges when runtime was billed but surcharges were not (simulated crash)", async () => {
    // Setup: tenant with enough balance
    await ledger.credit("tenant-1", Credit.fromCents(1000), "purchase", { description: "top-up" });

    // Simulate crash: manually debit only the runtime charge (as if the cron crashed after this)
    await ledger.debit("tenant-1", COST, "bot_runtime", {
      description: `Daily runtime: 1 bot(s) x $${COST.toDollars().toFixed(4)}`,
      referenceId: `runtime:2025-07-02:tenant-1`,
    });
    const afterRuntime = Credit.fromCents(1000).subtract(COST);
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(afterRuntime.toCentsRounded());

    // Retry run — runtime already billed, but surcharges should still be billed
    const result = await runRuntimeDeductions({
      ledger,
      date: "2025-07-02",
      getActiveBotCount: async () => 1,
      getResourceTierCosts: async () => Credit.fromCents(10),
      getStorageTierCosts: async () => Credit.fromCents(8),
      getAddonCosts: async () => Credit.fromCents(5),
    });

    expect(result.processed).toBe(1);
    expect(result.skipped).not.toContain("tenant-1");
    const expectedFinal = afterRuntime
      .subtract(Credit.fromCents(10))
      .subtract(Credit.fromCents(8))
      .subtract(Credit.fromCents(5));
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(expectedFinal.toCentsRounded());
  });

  it("bills only missing surcharges when some were already committed (simulated partial crash)", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(1000), "purchase", { description: "top-up" });

    // Simulate: runtime + tier already billed, storage + addon not yet
    await ledger.debit("tenant-1", COST, "bot_runtime", {
      description: `Daily runtime: 1 bot(s) x $${COST.toDollars().toFixed(4)}`,
      referenceId: `runtime:2025-07-03:tenant-1`,
    });
    await ledger.debit("tenant-1", Credit.fromCents(10), "resource_upgrade", {
      description: "Daily resource tier surcharge",
      referenceId: `runtime-tier:2025-07-03:tenant-1`,
    });
    const afterRuntimeAndTier = Credit.fromCents(1000).subtract(COST).subtract(Credit.fromCents(10));
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(afterRuntimeAndTier.toCentsRounded());

    const result = await runRuntimeDeductions({
      ledger,
      date: "2025-07-03",
      getActiveBotCount: async () => 1,
      getResourceTierCosts: async () => Credit.fromCents(10),
      getStorageTierCosts: async () => Credit.fromCents(8),
      getAddonCosts: async () => Credit.fromCents(5),
    });

    expect(result.processed).toBe(1);
    const expectedFinal = afterRuntimeAndTier.subtract(Credit.fromCents(8)).subtract(Credit.fromCents(5));
    expect((await ledger.balance("tenant-1")).toCentsRounded()).toBe(expectedFinal.toCentsRounded());
  });

  it("does not double-debit runtime on retry after partial deduction + crash", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(10), "purchase", { description: "top-up" });

    // Simulate: partial runtime debit already committed (balance was 10, cost was 17)
    await ledger.debit("tenant-1", Credit.fromCents(10), "bot_runtime", {
      description: "Partial daily runtime (balance exhausted): 1 bot(s)",
      referenceId: `runtime:2025-07-04:tenant-1`,
      allowNegative: true,
    });
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);

    // Retry — runtime already billed, balance is 0, nothing should happen
    const result = await runRuntimeDeductions({
      ledger,
      date: "2025-07-04",
      getActiveBotCount: async () => 1,
    });

    // Tenant still has 0 balance (tenantsWithBalance returns only positive), so won't be processed
    expect(result.processed).toBe(0);
    expect((await ledger.balance("tenant-1")).toCents()).toBe(0);
  });

  it("trial balance remains balanced after crash-recovery billing", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(1000), "purchase", { description: "top-up" });

    // Simulate crash: only runtime billed
    await ledger.debit("tenant-1", COST, "bot_runtime", {
      description: "Daily runtime: 1 bot(s) x $0.17",
      referenceId: `runtime:2025-07-05:tenant-1`,
    });

    // Retry — surcharges billed
    await runRuntimeDeductions({
      ledger,
      date: "2025-07-05",
      getActiveBotCount: async () => 1,
      getResourceTierCosts: async () => Credit.fromCents(10),
      getStorageTierCosts: async () => Credit.fromCents(8),
    });

    const tb = await ledger.trialBalance();
    expect(tb.balanced).toBe(true);
  });
});
