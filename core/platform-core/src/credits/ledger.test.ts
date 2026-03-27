import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { Credit } from "./credit.js";
import { DrizzleLedger, InsufficientBalanceError } from "./ledger.js";

let pool: PGlite;
let db: PlatformDb;

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

describe("DrizzleLedger", () => {
  let ledger: DrizzleLedger;

  beforeEach(async () => {
    await truncateAllTables(pool);
    ledger = new DrizzleLedger(db);
    await ledger.seedSystemAccounts();
  });

  // -----------------------------------------------------------------------
  // post() — the primitive
  // -----------------------------------------------------------------------

  describe("post()", () => {
    it("rejects entries with fewer than 2 lines", async () => {
      await expect(
        ledger.post({
          entryType: "purchase",
          tenantId: "t1",
          lines: [{ accountCode: "1000", amount: Credit.fromCents(100), side: "debit" }],
        }),
      ).rejects.toThrow("at least 2 lines");
    });

    it("rejects unbalanced entries", async () => {
      await expect(
        ledger.post({
          entryType: "purchase",
          tenantId: "t1",
          lines: [
            { accountCode: "1000", amount: Credit.fromCents(100), side: "debit" },
            { accountCode: "2000:t1", amount: Credit.fromCents(50), side: "credit" },
          ],
        }),
      ).rejects.toThrow("Unbalanced");
    });

    it("throws Unbalanced entry (not RangeError) when BigInt totals exceed MAX_SAFE_INTEGER", async () => {
      // Two debit lines each at MAX_SAFE_INTEGER raw — their BigInt sum exceeds MAX_SAFE_INTEGER.
      // Before the fix, Credit.fromRaw(Number(totalDebit)) would throw RangeError, masking the real error.
      const big = Credit.fromRaw(Number.MAX_SAFE_INTEGER);
      const small = Credit.fromRaw(1);
      await expect(
        ledger.post({
          entryType: "purchase",
          tenantId: "t1",
          lines: [
            { accountCode: "1000", amount: big, side: "debit" },
            { accountCode: "1000", amount: big, side: "debit" },
            { accountCode: "2000:t1", amount: small, side: "credit" },
          ],
        }),
      ).rejects.toThrow("Unbalanced entry");
    });

    it("rejects zero-amount lines", async () => {
      await expect(
        ledger.post({
          entryType: "purchase",
          tenantId: "t1",
          lines: [
            { accountCode: "1000", amount: Credit.ZERO, side: "debit" },
            { accountCode: "2000:t1", amount: Credit.ZERO, side: "credit" },
          ],
        }),
      ).rejects.toThrow("must be positive");
    });

    it("rejects negative-amount lines", async () => {
      await expect(
        ledger.post({
          entryType: "purchase",
          tenantId: "t1",
          lines: [
            { accountCode: "1000", amount: Credit.fromRaw(-100), side: "debit" },
            { accountCode: "2000:t1", amount: Credit.fromRaw(-100), side: "credit" },
          ],
        }),
      ).rejects.toThrow("must be positive");
    });

    it("posts a balanced entry and returns it", async () => {
      const entry = await ledger.post({
        entryType: "purchase",
        tenantId: "t1",
        description: "Stripe purchase",
        referenceId: "pi_abc123",
        metadata: { fundingSource: "stripe" },
        createdBy: "system",
        lines: [
          { accountCode: "1000", amount: Credit.fromCents(1000), side: "debit" },
          { accountCode: "2000:t1", amount: Credit.fromCents(1000), side: "credit" },
        ],
      });

      expect(entry.id).toBeTruthy();
      expect(entry.entryType).toBe("purchase");
      expect(entry.tenantId).toBe("t1");
      expect(entry.description).toBe("Stripe purchase");
      expect(entry.referenceId).toBe("pi_abc123");
      expect(entry.lines).toHaveLength(2);
    });

    it("enforces unique referenceId", async () => {
      await ledger.post({
        entryType: "purchase",
        tenantId: "t1",
        referenceId: "unique-ref",
        lines: [
          { accountCode: "1000", amount: Credit.fromCents(100), side: "debit" },
          { accountCode: "2000:t1", amount: Credit.fromCents(100), side: "credit" },
        ],
      });

      await expect(
        ledger.post({
          entryType: "purchase",
          tenantId: "t2",
          referenceId: "unique-ref",
          lines: [
            { accountCode: "1000", amount: Credit.fromCents(200), side: "debit" },
            { accountCode: "2000:t2", amount: Credit.fromCents(200), side: "credit" },
          ],
        }),
      ).rejects.toThrow();
    });

    it("supports multi-line entries (3+ lines)", async () => {
      // Split a $10 purchase: $7 to tenant, $3 to revenue (hypothetical split)
      const entry = await ledger.post({
        entryType: "split_purchase",
        tenantId: "t1",
        lines: [
          { accountCode: "1000", amount: Credit.fromCents(1000), side: "debit" },
          { accountCode: "2000:t1", amount: Credit.fromCents(700), side: "credit" },
          { accountCode: "4000", amount: Credit.fromCents(300), side: "credit" },
        ],
      });

      expect(entry.lines).toHaveLength(3);
    });

    it("acquires locks in consistent order regardless of input line order", async () => {
      // Post a 3-line entry with accounts in descending order.
      // If lock ordering works, this should succeed without deadlock
      // even when concurrent transactions use a different line order.
      const entry = await ledger.post({
        entryType: "correction",
        tenantId: "t1",
        lines: [
          { accountCode: "5070", amount: Credit.fromCents(500), side: "debit" },
          { accountCode: "2000:t1", amount: Credit.fromCents(200), side: "credit" },
          { accountCode: "1000", amount: Credit.fromCents(300), side: "credit" },
        ],
      });

      // Entry should succeed and contain all 3 lines
      expect(entry.lines).toHaveLength(3);

      // Verify balances are correct (lock order doesn't affect correctness)
      const cashBal = await ledger.accountBalance("1000");
      expect(cashBal.toCentsRounded()).toBe(-300); // credit side on debit-normal = negative

      const tb = await ledger.trialBalance();
      expect(tb.balanced).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // credit() — convenience
  // -----------------------------------------------------------------------

  describe("credit()", () => {
    it("purchase: DR cash, CR unearned_revenue", async () => {
      const entry = await ledger.credit("t1", Credit.fromCents(500), "purchase", {
        description: "Stripe $5",
        fundingSource: "stripe",
      });

      expect(entry.entryType).toBe("purchase");
      expect(entry.lines).toHaveLength(2);

      // biome-ignore lint/style/noNonNullAssertion: guaranteed present in balanced entry
      const debitLine = entry.lines.find((l) => l.side === "debit")!;
      // biome-ignore lint/style/noNonNullAssertion: guaranteed present in balanced entry
      const creditLine = entry.lines.find((l) => l.side === "credit")!;
      expect(debitLine.accountCode).toBe("1000"); // cash
      expect(creditLine.accountCode).toBe("2000:t1"); // unearned revenue
      expect(debitLine.amount.toCentsRounded()).toBe(500);
      expect(creditLine.amount.toCentsRounded()).toBe(500);
    });

    it("signup_grant: DR expense, CR unearned_revenue", async () => {
      const entry = await ledger.credit("t1", Credit.fromCents(100), "signup_grant");

      // biome-ignore lint/style/noNonNullAssertion: guaranteed present in balanced entry
      const debitLine = entry.lines.find((l) => l.side === "debit")!;
      expect(debitLine.accountCode).toBe("5000"); // expense:signup_grant
    });

    it("rejects zero amount", async () => {
      await expect(ledger.credit("t1", Credit.ZERO, "purchase")).rejects.toThrow("must be positive");
    });

    it("supports referenceId for idempotency", async () => {
      await ledger.credit("t1", Credit.fromCents(100), "purchase", {
        referenceId: "pi_abc",
      });
      expect(await ledger.hasReferenceId("pi_abc")).toBe(true);
      expect(await ledger.hasReferenceId("pi_xyz")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // debit() — convenience
  // -----------------------------------------------------------------------

  describe("debit()", () => {
    beforeEach(async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
    });

    it("bot_runtime: DR unearned_revenue, CR revenue", async () => {
      const entry = await ledger.debit("t1", Credit.fromCents(200), "bot_runtime", {
        description: "1hr compute",
      });

      expect(entry.entryType).toBe("bot_runtime");
      // biome-ignore lint/style/noNonNullAssertion: guaranteed present in balanced entry
      const debitLine = entry.lines.find((l) => l.side === "debit")!;
      // biome-ignore lint/style/noNonNullAssertion: guaranteed present in balanced entry
      const creditLine = entry.lines.find((l) => l.side === "credit")!;
      expect(debitLine.accountCode).toBe("2000:t1"); // unearned revenue decreases
      expect(creditLine.accountCode).toBe("4000"); // revenue recognized
    });

    it("throws InsufficientBalanceError when balance too low", async () => {
      await expect(ledger.debit("t1", Credit.fromCents(2000), "bot_runtime")).rejects.toBeInstanceOf(
        InsufficientBalanceError,
      );
    });

    it("allowNegative bypasses balance check", async () => {
      const entry = await ledger.debit("t1", Credit.fromCents(2000), "bot_runtime", {
        allowNegative: true,
      });
      expect(entry.entryType).toBe("bot_runtime");

      const bal = await ledger.balance("t1");
      expect(bal.toCentsRounded()).toBe(-1000);
    });

    it("refund: DR unearned_revenue, CR cash", async () => {
      const entry = await ledger.debit("t1", Credit.fromCents(300), "refund");
      // biome-ignore lint/style/noNonNullAssertion: guaranteed present in balanced entry
      const creditLine = entry.lines.find((l) => l.side === "credit")!;
      expect(creditLine.accountCode).toBe("1000"); // cash goes out
    });

    it("rejects zero amount", async () => {
      await expect(ledger.debit("t1", Credit.ZERO, "bot_runtime")).rejects.toThrow("must be positive");
    });

    it("concurrent debits do not overdraft", async () => {
      // Balance is $10.00 from beforeEach credit.
      // Two concurrent $8 debits — only one should succeed.
      const results = await Promise.allSettled([
        ledger.debit("t1", Credit.fromCents(800), "bot_runtime"),
        ledger.debit("t1", Credit.fromCents(800), "bot_runtime"),
      ]);

      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect((failures[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientBalanceError);

      // Balance should be $2.00, not -$6.00
      const bal = await ledger.balance("t1");
      expect(bal.toCentsRounded()).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // balance()
  // -----------------------------------------------------------------------

  describe("balance()", () => {
    it("returns ZERO for unknown tenant", async () => {
      expect((await ledger.balance("unknown")).isZero()).toBe(true);
    });

    it("reflects credits and debits", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      expect((await ledger.balance("t1")).toCentsRounded()).toBe(1000);

      await ledger.debit("t1", Credit.fromCents(300), "bot_runtime");
      expect((await ledger.balance("t1")).toCentsRounded()).toBe(700);
    });

    it("multiple tenants are independent", async () => {
      await ledger.credit("t1", Credit.fromCents(500), "purchase");
      await ledger.credit("t2", Credit.fromCents(200), "purchase");

      expect((await ledger.balance("t1")).toCentsRounded()).toBe(500);
      expect((await ledger.balance("t2")).toCentsRounded()).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // accountBalance() — any account
  // -----------------------------------------------------------------------

  describe("accountBalance()", () => {
    it("tracks cash (asset) balance", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase"); // DR cash
      expect((await ledger.accountBalance("1000")).toCentsRounded()).toBe(1000);

      await ledger.debit("t1", Credit.fromCents(300), "refund"); // CR cash
      expect((await ledger.accountBalance("1000")).toCentsRounded()).toBe(700);
    });

    it("tracks revenue balance", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      await ledger.debit("t1", Credit.fromCents(400), "bot_runtime"); // CR revenue
      expect((await ledger.accountBalance("4000")).toCentsRounded()).toBe(400);
    });

    it("tracks expense balance", async () => {
      await ledger.credit("t1", Credit.fromCents(100), "signup_grant"); // DR expense
      expect((await ledger.accountBalance("5000")).toCentsRounded()).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // trialBalance() — THE accounting invariant
  // -----------------------------------------------------------------------

  describe("trialBalance()", () => {
    it("empty ledger is balanced", async () => {
      const tb = await ledger.trialBalance();
      expect(tb.balanced).toBe(true);
      expect(tb.difference.isZero()).toBe(true);
    });

    it("balanced after multiple transactions", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      await ledger.credit("t2", Credit.fromCents(500), "signup_grant");
      await ledger.debit("t1", Credit.fromCents(200), "bot_runtime");
      await ledger.debit("t2", Credit.fromCents(100), "adapter_usage");

      const tb = await ledger.trialBalance();
      expect(tb.balanced).toBe(true);
      expect(tb.totalDebits.equals(tb.totalCredits)).toBe(true);
    });

    it("detects imbalance from direct DB corruption", async () => {
      await ledger.credit("t1", Credit.fromCents(100), "purchase");

      // Corrupt the ledger: insert an unmatched debit line directly into journal_lines.
      const entryRows = await pool.query<{ id: string }>("SELECT id FROM journal_entries LIMIT 1");
      const accountRows = await pool.query<{ id: string }>("SELECT id FROM accounts WHERE code = '1000' LIMIT 1");
      const entryId = entryRows.rows[0].id;
      const accountId = accountRows.rows[0].id;

      // Insert an unmatched debit line worth 999 raw units — no corresponding credit
      await pool.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, amount, side)
         VALUES ('corrupt-line-1', $1, $2, 999, 'debit')`,
        [entryId, accountId],
      );

      const tb = await ledger.trialBalance();
      expect(tb.balanced).toBe(false);
      expect(tb.difference.toRaw()).toBe(999);
    });
  });

  // -----------------------------------------------------------------------
  // history()
  // -----------------------------------------------------------------------

  describe("history()", () => {
    it("returns entries newest-first with lines", async () => {
      await ledger.credit("t1", Credit.fromCents(100), "purchase");
      await ledger.credit("t1", Credit.fromCents(200), "admin_grant");
      await ledger.debit("t1", Credit.fromCents(50), "bot_runtime");

      const entries = await ledger.history("t1");
      expect(entries).toHaveLength(3);
      expect(entries[0].entryType).toBe("bot_runtime"); // newest
      expect(entries[2].entryType).toBe("purchase"); // oldest
      // Each entry has lines
      for (const e of entries) {
        expect(e.lines.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("filters by type", async () => {
      await ledger.credit("t1", Credit.fromCents(100), "purchase");
      await ledger.credit("t1", Credit.fromCents(200), "signup_grant");

      const purchases = await ledger.history("t1", { type: "purchase" });
      expect(purchases).toHaveLength(1);
      expect(purchases[0].entryType).toBe("purchase");
    });

    it("paginates with limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        await ledger.credit("t1", Credit.fromCents(100), "purchase");
      }

      const page1 = await ledger.history("t1", { limit: 2, offset: 0 });
      const page2 = await ledger.history("t1", { limit: 2, offset: 2 });
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it("isolates tenants", async () => {
      await ledger.credit("t1", Credit.fromCents(100), "purchase");
      await ledger.credit("t2", Credit.fromCents(200), "purchase");

      expect(await ledger.history("t1")).toHaveLength(1);
      expect(await ledger.history("t2")).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // tenantsWithBalance()
  // -----------------------------------------------------------------------

  describe("tenantsWithBalance()", () => {
    it("returns only tenants with positive balance", async () => {
      await ledger.credit("t1", Credit.fromCents(500), "purchase");
      await ledger.credit("t2", Credit.fromCents(300), "purchase");
      await ledger.debit("t2", Credit.fromCents(300), "bot_runtime"); // zero balance

      const result = await ledger.tenantsWithBalance();
      expect(result).toHaveLength(1);
      expect(result[0].tenantId).toBe("t1");
      expect(result[0].balance.toCentsRounded()).toBe(500);
    });
  });

  // -----------------------------------------------------------------------
  // lifetimeSpend()
  // -----------------------------------------------------------------------

  describe("lifetimeSpend()", () => {
    it("sums all debits from tenant liability account", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      await ledger.debit("t1", Credit.fromCents(200), "bot_runtime");
      await ledger.debit("t1", Credit.fromCents(300), "adapter_usage");

      const spend = await ledger.lifetimeSpend("t1");
      expect(spend.toCentsRounded()).toBe(500);
    });

    it("returns zero for unknown tenant", async () => {
      const spend = await ledger.lifetimeSpend("unknown");
      expect(spend.isZero()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // lifetimeSpendBatch()
  // -----------------------------------------------------------------------

  describe("lifetimeSpendBatch()", () => {
    it("returns spend for multiple tenants", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      await ledger.credit("t2", Credit.fromCents(500), "purchase");
      await ledger.debit("t1", Credit.fromCents(200), "bot_runtime");
      await ledger.debit("t2", Credit.fromCents(100), "bot_runtime");

      const result = await ledger.lifetimeSpendBatch(["t1", "t2", "t3"]);
      // biome-ignore lint/style/noNonNullAssertion: keys guaranteed present per API contract
      expect(result.get("t1")!.toCentsRounded()).toBe(200);
      // biome-ignore lint/style/noNonNullAssertion: keys guaranteed present per API contract
      expect(result.get("t2")!.toCentsRounded()).toBe(100);
      // biome-ignore lint/style/noNonNullAssertion: keys guaranteed present per API contract
      expect(result.get("t3")!.isZero()).toBe(true);
    });

    it("returns empty map for empty input", async () => {
      const result = await ledger.lifetimeSpendBatch([]);
      expect(result.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // expiredCredits()
  // -----------------------------------------------------------------------

  describe("expiredCredits()", () => {
    it("returns entries with expirable types whose expiresAt has passed", async () => {
      // Post a signup_grant (in EXPIRABLE_CREDIT_TYPES) with an expiresAt in the past
      await ledger.credit("t1", Credit.fromCents(100), "signup_grant", {
        expiresAt: "2020-01-01T00:00:00Z",
      });

      const expired = await ledger.expiredCredits(new Date().toISOString());
      expect(expired).toHaveLength(1);
      expect(expired[0].tenantId).toBe("t1");
      expect(expired[0].amount.toCentsRounded()).toBe(100);
    });

    it("excludes entries whose type is not in EXPIRABLE_CREDIT_TYPES", async () => {
      // Post a credit-side entry on the liability account with an unknown entry type
      // so the liability credit line is present (the subquery finds an amount) but
      // the allowlist filter must exclude it.
      await ledger.post({
        entryType: "marketplace_fee", // NOT in EXPIRABLE_CREDIT_TYPES
        tenantId: "t1",
        metadata: { expiresAt: "2020-01-01T00:00:00Z" },
        lines: [
          { accountCode: "1000", amount: Credit.fromCents(100), side: "debit" },
          { accountCode: "2000:t1", amount: Credit.fromCents(100), side: "credit" },
        ],
      });

      const expired = await ledger.expiredCredits(new Date().toISOString());
      expect(expired).toHaveLength(0);
    });

    it("excludes entries whose expiresAt is in the future", async () => {
      await ledger.credit("t1", Credit.fromCents(100), "purchase", {
        expiresAt: "2099-01-01T00:00:00Z",
      });

      const expired = await ledger.expiredCredits(new Date().toISOString());
      expect(expired).toHaveLength(0);
    });

    it("excludes entries already clawed back (idempotency)", async () => {
      const entry = await ledger.credit("t1", Credit.fromCents(100), "purchase", {
        expiresAt: "2020-01-01T00:00:00Z",
      });

      // Simulate a prior expiry entry by posting with the expiry referenceId
      await ledger.post({
        entryType: "credit_expiry",
        tenantId: "t1",
        referenceId: `expiry:${entry.id}`,
        lines: [
          { accountCode: "2000:t1", amount: Credit.fromCents(100), side: "debit" },
          { accountCode: "4060", amount: Credit.fromCents(100), side: "credit" },
        ],
      });

      const expired = await ledger.expiredCredits(new Date().toISOString());
      expect(expired).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // memberUsage()
  // -----------------------------------------------------------------------

  describe("memberUsage()", () => {
    it("aggregates debit totals per attributed user", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      await ledger.debit("t1", Credit.fromCents(200), "bot_runtime", {
        attributedUserId: "user-a",
      });
      await ledger.debit("t1", Credit.fromCents(300), "bot_runtime", {
        attributedUserId: "user-a",
      });
      await ledger.debit("t1", Credit.fromCents(100), "bot_runtime", {
        attributedUserId: "user-b",
      });

      const usage = await ledger.memberUsage("t1");
      expect(usage).toHaveLength(2);

      // biome-ignore lint/style/noNonNullAssertion: seeded above, guaranteed present
      const userA = usage.find((u) => u.userId === "user-a")!;
      // biome-ignore lint/style/noNonNullAssertion: seeded above, guaranteed present
      const userB = usage.find((u) => u.userId === "user-b")!;
      expect(userA.totalDebit.toCentsRounded()).toBe(500);
      expect(userA.transactionCount).toBe(2);
      expect(userB.totalDebit.toCentsRounded()).toBe(100);
      expect(userB.transactionCount).toBe(1);
    });

    it("excludes entries without attributedUserId", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      await ledger.debit("t1", Credit.fromCents(200), "bot_runtime"); // no user

      const usage = await ledger.memberUsage("t1");
      expect(usage).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // The accounting equation: Assets = Liabilities + Equity + Revenue - Expenses
  // -----------------------------------------------------------------------

  describe("accounting equation", () => {
    it("holds after a purchase + usage cycle", async () => {
      // Tenant buys $10
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      // Tenant uses $3
      await ledger.debit("t1", Credit.fromCents(300), "bot_runtime");

      const cash = await ledger.accountBalance("1000"); // asset
      const unearned = await ledger.balance("t1"); // liability
      const revenue = await ledger.accountBalance("4000"); // revenue

      // Assets ($10) = Liabilities ($7) + Revenue ($3)
      expect(cash.toCentsRounded()).toBe(1000);
      expect(unearned.toCentsRounded()).toBe(700);
      expect(revenue.toCentsRounded()).toBe(300);
      expect(cash.toCentsRounded()).toBe(unearned.toCentsRounded() + revenue.toCentsRounded());
    });

    it("holds after purchase + grant + usage + refund", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      await ledger.credit("t1", Credit.fromCents(100), "signup_grant");
      await ledger.debit("t1", Credit.fromCents(400), "bot_runtime");
      await ledger.debit("t1", Credit.fromCents(200), "refund");

      // Assets = cash: $10 purchase - $2 refund = $8
      // Liabilities = unearned: $10 + $1 grant - $4 usage - $2 refund = $5
      // Revenue = $4
      // Expense = $1 (signup grant)
      // A = L + R - E → $8 = $5 + $4 - $1 = $8 ✓
      const cash = await ledger.accountBalance("1000");
      const unearned = await ledger.balance("t1");
      const revenue = await ledger.accountBalance("4000");
      const expense = await ledger.accountBalance("5000");

      expect(cash.toCentsRounded()).toBe(800);
      expect(unearned.toCentsRounded()).toBe(500);
      expect(revenue.toCentsRounded()).toBe(400);
      expect(expense.toCentsRounded()).toBe(100);

      // Verify trial balance
      const tb = await ledger.trialBalance();
      expect(tb.balanced).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // deadlock prevention — concurrent multi-line entries
  // -----------------------------------------------------------------------

  describe("deadlock prevention", () => {
    it("concurrent multi-line entries with overlapping accounts succeed", async () => {
      // Fund two tenants
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");
      await ledger.credit("t2", Credit.fromCents(1000), "purchase");

      // Two entries that touch accounts in potentially reverse order.
      // Both touch account 4000 (revenue), creating a potential lock conflict.
      const results = await Promise.allSettled([
        ledger.debit("t1", Credit.fromCents(50), "bot_runtime"),
        ledger.debit("t2", Credit.fromCents(30), "bot_runtime"),
      ]);

      // Both should succeed — lock ordering prevents deadlock
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      // Verify balances are correct
      expect((await ledger.balance("t1")).toCentsRounded()).toBe(950);
      expect((await ledger.balance("t2")).toCentsRounded()).toBe(970);

      // Revenue account should reflect both debits
      expect((await ledger.accountBalance("4000")).toCentsRounded()).toBe(80);

      // Trial balance must still be balanced
      const tb = await ledger.trialBalance();
      expect(tb.balanced).toBe(true);
    });

    it("concurrent multi-line entries on same tenant serialize correctly", async () => {
      await ledger.credit("t1", Credit.fromCents(1000), "purchase");

      // Two debits on the same tenant, touching overlapping accounts.
      const results = await Promise.allSettled([
        ledger.debit("t1", Credit.fromCents(100), "bot_runtime"),
        ledger.debit("t1", Credit.fromCents(200), "adapter_usage"),
      ]);

      expect(results.every((r) => r.status === "fulfilled")).toBe(true);

      // Balance: $10 - $1 - $2 = $7
      expect((await ledger.balance("t1")).toCentsRounded()).toBe(700);

      // Revenue accounts
      expect((await ledger.accountBalance("4000")).toCentsRounded()).toBe(100); // bot_runtime
      expect((await ledger.accountBalance("4010")).toCentsRounded()).toBe(200); // adapter_usage

      const tb = await ledger.trialBalance();
      expect(tb.balanced).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // debitCapped()
  // -----------------------------------------------------------------------

  describe("debitCapped()", () => {
    it("caps debit at current balance when maxAmount exceeds balance", async () => {
      await ledger.credit("tenant-cap", Credit.fromCents(300), "promo", {
        description: "Test grant",
      });

      const entry = await ledger.debitCapped(
        "tenant-cap",
        Credit.fromCents(500), // maxAmount > balance
        "credit_expiry",
        { description: "Expiry test", referenceId: "expiry:test-cap" },
      );

      if (entry === null) throw new Error("expected non-null entry");
      // Should have debited 300 (the balance), not 500 (the maxAmount)
      const debitLine = entry.lines.find((l) => l.accountCode === "2000:tenant-cap" && l.side === "debit");
      if (!debitLine) throw new Error("expected debit line");
      expect(debitLine.amount.toCents()).toBe(300);

      const balance = await ledger.balance("tenant-cap");
      expect(balance.toCents()).toBe(0);
    });

    it("returns null when balance is zero", async () => {
      const entry = await ledger.debitCapped("tenant-zero", Credit.fromCents(500), "credit_expiry", {
        description: "Expiry test",
        referenceId: "expiry:test-zero",
      });

      expect(entry).toBeNull();
    });

    it("debits exact maxAmount when balance exceeds it", async () => {
      await ledger.credit("tenant-over", Credit.fromCents(1000), "purchase", {
        description: "Big deposit",
      });

      const entry = await ledger.debitCapped("tenant-over", Credit.fromCents(300), "credit_expiry", {
        description: "Partial expiry",
        referenceId: "expiry:test-over",
      });

      if (entry === null) throw new Error("expected non-null entry");
      const debitLine = entry.lines.find((l) => l.accountCode === "2000:tenant-over" && l.side === "debit");
      if (!debitLine) throw new Error("expected debit line");
      expect(debitLine.amount.toCents()).toBe(300);

      const balance = await ledger.balance("tenant-over");
      expect(balance.toCents()).toBe(700);
    });

    it("books balance correctly after capped debit (trial balance holds)", async () => {
      await ledger.credit("tenant-tb", Credit.fromCents(200), "promo", {
        description: "Small grant",
      });

      await ledger.debitCapped("tenant-tb", Credit.fromCents(500), "credit_expiry", {
        description: "Expiry",
        referenceId: "expiry:test-tb",
      });

      const tb = await ledger.trialBalance();
      expect(tb.balanced).toBe(true);
    });
  });
});
