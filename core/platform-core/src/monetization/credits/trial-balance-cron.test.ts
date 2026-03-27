import type { PGlite } from "@electric-sql/pglite";
import { Credit, DrizzleLedger, runTrialBalanceCron } from "@wopr-network/platform-core/credits";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, truncateAllTables } from "../../test/db.js";

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

  it("logs an error on imbalance without throwing", async () => {
    vi.spyOn(ledger, "trialBalance").mockResolvedValueOnce({
      totalDebits: Credit.fromCents(1000),
      totalCredits: Credit.fromCents(900),
      balanced: false,
      difference: Credit.fromCents(100),
    });

    const result = await runTrialBalanceCron({ ledger });
    expect(result.balanced).toBe(false);
    expect(result.differenceRaw).toBe(Credit.fromCents(100).toRaw());
  });
});
