import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { Credit } from "./credit.js";
import { DrizzleLedger } from "./ledger.js";
import { runTrialBalanceCron } from "./trial-balance-cron.js";

describe("runTrialBalanceCron", () => {
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

  it("returns balanced when no entries exist", async () => {
    const result = await runTrialBalanceCron({ ledger });
    expect(result.balanced).toBe(true);
    expect(result.differenceRaw).toBe(0);
  });

  it("returns balanced after normal credit and debit", async () => {
    await ledger.credit("t1", Credit.fromCents(500), "purchase");
    await ledger.debit("t1", Credit.fromCents(200), "bot_runtime");

    const result = await runTrialBalanceCron({ ledger });
    expect(result.balanced).toBe(true);
    expect(result.differenceRaw).toBe(0);
  });

  it("logs an error on imbalance", async () => {
    // Inject an imbalance by mocking trialBalance to return unbalanced data
    const errorSpy = vi.spyOn(ledger, "trialBalance").mockResolvedValueOnce({
      totalDebits: Credit.fromCents(1000),
      totalCredits: Credit.fromCents(900),
      balanced: false,
      difference: Credit.fromCents(100),
    });

    const result = await runTrialBalanceCron({ ledger });
    expect(result.balanced).toBe(false);
    expect(result.differenceRaw).toBe(Credit.fromCents(100).toRaw());

    errorSpy.mockRestore();
  });

  it("does not throw on imbalance", async () => {
    vi.spyOn(ledger, "trialBalance").mockResolvedValueOnce({
      totalDebits: Credit.fromCents(500),
      totalCredits: Credit.fromCents(400),
      balanced: false,
      difference: Credit.fromCents(100),
    });

    await expect(runTrialBalanceCron({ ledger })).resolves.not.toThrow();
  });
});
