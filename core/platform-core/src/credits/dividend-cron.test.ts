import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { Credit } from "./credit.js";
import { type DividendCronConfig, runDividendCron } from "./dividend-cron.js";
import { CREDIT_TYPE_ACCOUNT, DrizzleLedger } from "./ledger.js";

/**
 * Insert a backdated purchase entry into the double-entry ledger.
 * Uses post() with postedAt override to simulate historical purchases.
 */
async function insertPurchase(
  ledger: DrizzleLedger,
  tenantId: string,
  amountCents: number,
  postedAt: string,
): Promise<void> {
  const amount = Credit.fromCents(amountCents);
  // Purchase: DR cash (1000), CR unearned_revenue (2000:<tenantId>)
  await ledger.post({
    entryType: "purchase",
    tenantId,
    description: `Test purchase ${amountCents}¢`,
    referenceId: `test-purchase:${tenantId}:${postedAt}:${Math.random()}`,
    postedAt,
    lines: [
      { accountCode: CREDIT_TYPE_ACCOUNT.purchase, amount, side: "debit" },
      { accountCode: `2000:${tenantId}`, amount, side: "credit" },
    ],
  });
}

describe("runDividendCron", () => {
  let pool: PGlite;
  let db: PlatformDb;
  let ledger: DrizzleLedger;

  beforeAll(async () => {
    ({ db, pool } = await createTestDb());
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    ledger = new DrizzleLedger(db);
    await ledger.seedSystemAccounts();
  });

  function makeConfig(overrides?: Partial<DividendCronConfig>): DividendCronConfig {
    return {
      ledger,
      matchRate: 1.0,
      targetDate: "2026-02-20",
      ...overrides,
    };
  }

  it("distributes dividend to eligible tenants", async () => {
    await insertPurchase(ledger, "t1", 1000, "2026-02-20 12:00:00");

    const result = await runDividendCron(makeConfig());

    expect(result.distributed).toBe(1);
    expect(result.pool.toCents()).toBe(1000);
    expect(result.perUser.toCents()).toBe(1000);
    expect(result.activeCount).toBe(1);
  });

  it("is idempotent — skips if already ran for the date", async () => {
    await insertPurchase(ledger, "t1", 1000, "2026-02-20 12:00:00");

    const result1 = await runDividendCron(makeConfig());
    expect(result1.distributed).toBe(1);
    expect(result1.skippedAlreadyRun).toBe(false);

    const balanceAfterFirst = await ledger.balance("t1");

    const result2 = await runDividendCron(makeConfig());
    expect(result2.skippedAlreadyRun).toBe(true);
    expect(result2.distributed).toBe(0);

    expect((await ledger.balance("t1")).equals(balanceAfterFirst)).toBe(true);
  });

  it("handles floor rounding — remainder is not distributed", async () => {
    await insertPurchase(ledger, "t1", 50, "2026-02-20 12:00:00");
    await insertPurchase(ledger, "t2", 30, "2026-02-20 12:00:00");
    await insertPurchase(ledger, "t3", 20, "2026-02-20 12:00:00");

    const result = await runDividendCron(makeConfig());

    expect(result.pool.toCents()).toBe(100);
    expect(result.activeCount).toBe(3);
    // Nanodollar precision: floor(1_000_000_000 raw / 3) = 333_333_333 raw each
    expect(result.perUser.toRaw()).toBe(333_333_333);
    expect(result.distributed).toBe(3);
  });

  it("skips distribution when pool is zero", async () => {
    // Tenant purchased within 7 days but NOT on target date -> pool = 0
    await insertPurchase(ledger, "t1", 500, "2026-02-18 12:00:00");

    const result = await runDividendCron(makeConfig());

    expect(result.pool.toCents()).toBe(0);
    expect(result.activeCount).toBe(1);
    expect(result.perUser.toCents()).toBe(0);
    expect(result.distributed).toBe(0);
  });

  it("distributes sub-cent amounts at nanodollar precision", async () => {
    // 1 cent purchase, 3 active users: pool = 10_000_000 raw
    // floor(10_000_000 / 3) = 3_333_333 raw each — non-zero, gets distributed
    await insertPurchase(ledger, "t1", 1, "2026-02-20 12:00:00");
    await insertPurchase(ledger, "t2", 500, "2026-02-18 12:00:00");
    await insertPurchase(ledger, "t3", 500, "2026-02-17 12:00:00");

    const result = await runDividendCron(makeConfig({ matchRate: 1.0 }));

    expect(result.pool.toCents()).toBe(1);
    expect(result.activeCount).toBe(3);
    expect(result.perUser.toRaw()).toBe(3_333_333);
    expect(result.distributed).toBe(3);
  });

  it("records transactions with correct type and referenceId", async () => {
    await insertPurchase(ledger, "t1", 1000, "2026-02-20 12:00:00");

    await runDividendCron(makeConfig());

    const history = await ledger.history("t1", { type: "community_dividend" });
    expect(history).toHaveLength(1);
    expect(history[0].entryType).toBe("community_dividend");
    expect(history[0].referenceId).toBe("dividend:2026-02-20:t1");
    expect(history[0].description).toContain("Community dividend");
  });

  it("collects errors without stopping distribution to other tenants", async () => {
    await insertPurchase(ledger, "t1", 500, "2026-02-20 12:00:00");
    await insertPurchase(ledger, "t2", 500, "2026-02-20 12:00:00");

    const result = await runDividendCron(makeConfig());

    expect(result.distributed).toBe(2);
    expect(result.errors).toEqual([]);
  });
});
