import type { PGlite } from "@electric-sql/pglite";
import { Credit, DrizzleLedger } from "@wopr-network/platform-core/credits";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DrizzleDb } from "../../db/index.js";
import { createTestDb, truncateAllTables } from "../../test/db.js";
import { dailyBotCost, runRuntimeDeductions } from "./runtime-cron.js";

describe("runtime cron with storage tiers", () => {
  const TODAY = "2025-01-01";
  const BASE_COST_CREDIT = dailyBotCost(TODAY);
  let pool: PGlite;
  let db: DrizzleDb;
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

  it("debits base cost plus storage surcharge for pro tier", async () => {
    await ledger.credit("t1", Credit.fromCents(1000), "purchase");
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      getStorageTierCosts: async () => Credit.fromCents(8),
    });
    expect(result.processed).toBe(1);
    const balance = await ledger.balance("t1");
    // 1000 - dailyBotCost (base) - 8 (pro storage surcharge)
    const expected = Credit.fromCents(1000).subtract(BASE_COST_CREDIT).subtract(Credit.fromCents(8));
    expect(balance.toCents()).toBe(expected.toCents());
  });

  it("debits only base cost for standard storage tier (zero surcharge)", async () => {
    await ledger.credit("t1", Credit.fromCents(1000), "purchase");
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      getStorageTierCosts: async () => Credit.ZERO,
    });
    expect(result.processed).toBe(1);
    const expectedStd = Credit.fromCents(1000).subtract(BASE_COST_CREDIT);
    expect((await ledger.balance("t1")).toCents()).toBe(expectedStd.toCents());
  });

  it("skips storage surcharge when callback not provided (backward compat)", async () => {
    await ledger.credit("t1", Credit.fromCents(1000), "purchase");
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
    });
    expect(result.processed).toBe(1);
    const expectedBackcompat = Credit.fromCents(1000).subtract(BASE_COST_CREDIT);
    expect((await ledger.balance("t1")).toCents()).toBe(expectedBackcompat.toCents());
  });

  it("suspends tenant when storage surcharge exhausts remaining balance", async () => {
    // Seed just enough for base cost + 3 cents, so storage surcharge (8) exceeds remainder
    const seed = BASE_COST_CREDIT.add(Credit.fromCents(3));
    await ledger.credit("t1", seed, "purchase");
    const suspended: string[] = [];
    const result = await runRuntimeDeductions({
      ledger,
      date: TODAY,
      getActiveBotCount: async () => 1,
      getStorageTierCosts: async () => Credit.fromCents(8),
      onSuspend: (tenantId) => {
        suspended.push(tenantId);
      },
    });
    // seed - BASE_COST = 3 remaining, then 8 surcharge > 3, so partial debit + suspend
    expect(result.processed).toBe(1);
    expect(result.suspended).toContain("t1");
    expect((await ledger.balance("t1")).toCents()).toBe(0);
  });
});
