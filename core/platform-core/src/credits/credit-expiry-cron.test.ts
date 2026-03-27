import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { Credit } from "./credit.js";
import { runCreditExpiryCron } from "./credit-expiry-cron.js";
import { DrizzleLedger } from "./ledger.js";

describe("runCreditExpiryCron", () => {
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

  // All tests pass an explicit `now` parameter — hardcoded dates are time-independent
  // because runCreditExpiryCron never reads the system clock.
  it("returns empty result when no expired credits exist", async () => {
    const result = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    expect(result.processed).toBe(0);
    expect(result.expired).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("debits expired promotional credit grant", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "promo", {
      description: "New user bonus",
      referenceId: "promo:tenant-1",
      expiresAt: "2026-01-10T00:00:00Z",
    });

    const result = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    expect(result.processed).toBe(1);
    expect(result.expired).toContain("tenant-1");

    const balance = await ledger.balance("tenant-1");
    expect(balance.toCents()).toBe(0);
  });

  it("does not debit non-expired credits", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "promo", {
      description: "Future bonus",
      referenceId: "promo:tenant-1-future",
      expiresAt: "2026-02-01T00:00:00Z",
    });

    const result = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    expect(result.processed).toBe(0);

    const balance = await ledger.balance("tenant-1");
    expect(balance.toCents()).toBe(500);
  });

  it("does not debit credits without expires_at", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", { description: "Top-up" });

    const result = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    expect(result.processed).toBe(0);

    const balance = await ledger.balance("tenant-1");
    expect(balance.toCents()).toBe(500);
  });

  it("only debits up to available balance when partially consumed", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "promo", {
      description: "Promo",
      referenceId: "promo:partial",
      expiresAt: "2026-01-10T00:00:00Z",
    });
    await ledger.debit("tenant-1", Credit.fromCents(300), "bot_runtime", { description: "Runtime" });

    const result = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    expect(result.processed).toBe(1);

    const balance = await ledger.balance("tenant-1");
    expect(balance.toCents()).toBe(0);
  });

  it("is idempotent -- does not double-debit on second run", async () => {
    await ledger.credit("tenant-1", Credit.fromCents(500), "promo", {
      description: "Promo",
      referenceId: "promo:idemp",
      expiresAt: "2026-01-10T00:00:00Z",
    });

    await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    const balanceAfterFirst = await ledger.balance("tenant-1");

    const result2 = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    expect(result2.processed).toBe(0);

    const balanceAfterSecond = await ledger.balance("tenant-1");
    expect(balanceAfterSecond.toCents()).toBe(balanceAfterFirst.toCents());
  });

  it("skips expiry when balance has been fully consumed before cron runs", async () => {
    // Simulate: grant expires but tenant spent everything before cron ran
    await ledger.credit("tenant-1", Credit.fromCents(500), "promo", {
      description: "Promo",
      referenceId: "promo:fully-consumed",
      expiresAt: "2026-01-10T00:00:00Z",
    });
    // Tenant spends entire balance before expiry cron runs
    await ledger.debit("tenant-1", Credit.fromCents(500), "bot_runtime", { description: "Full spend" });

    const result = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    // Zero balance — nothing to expire
    expect(result.processed).toBe(0);

    const balance = await ledger.balance("tenant-1");
    expect(balance.toCents()).toBe(0);
  });

  it("only expires remaining balance when usage reduced it between grant and expiry", async () => {
    // Grant $5, spend $3 before cron, cron should only expire remaining $2
    await ledger.credit("tenant-1", Credit.fromCents(500), "promo", {
      description: "Promo",
      referenceId: "promo:partial-concurrent",
      expiresAt: "2026-01-10T00:00:00Z",
    });
    await ledger.debit("tenant-1", Credit.fromCents(300), "bot_runtime", { description: "Partial spend" });

    const result = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    expect(result.processed).toBe(1);
    expect(result.expired).toContain("tenant-1");

    // $5 granted - $3 used - $2 expired = $0
    const balance = await ledger.balance("tenant-1");
    expect(balance.toCents()).toBe(0);
  });

  it("does not return unknown entry type even with expiresAt metadata", async () => {
    // Simulate a hypothetical new entry type that has expiresAt in metadata.
    // With the old denylist approach, this would be incorrectly returned.
    // With the allowlist, it must be excluded.
    const entry = await ledger.post({
      entryType: "marketplace_fee",
      tenantId: "tenant-1",
      description: "Hypothetical new debit type with expiresAt",
      metadata: { expiresAt: "2026-01-10T00:00:00Z" },
      lines: [
        { accountCode: "2000:tenant-1", amount: Credit.fromCents(100), side: "debit" },
        { accountCode: "4000", amount: Credit.fromCents(100), side: "credit" },
      ],
    });

    // Give tenant a balance first so it's not filtered by zero-balance
    await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", {
      description: "Top-up",
    });

    const expired = await ledger.expiredCredits("2026-01-15T00:00:00Z");
    const ids = expired.map((e) => e.entryId);
    expect(ids).not.toContain(entry.id);

    // Full cron should also not touch it
    const result = await runCreditExpiryCron({ ledger, now: "2026-01-15T00:00:00Z" });
    expect(result.processed).toBe(0);
  });
});
