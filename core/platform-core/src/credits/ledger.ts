/**
 * Double-entry credit ledger.
 *
 * Every mutation posts a balanced journal entry: sum(debits) === sum(credits).
 * A tenant's "credit balance" is the balance of their unearned_revenue liability account.
 *
 * Account model:
 *   ASSETS      — cash, stripe_receivable
 *   LIABILITIES — unearned_revenue:<tenant_id> (the "credit balance")
 *   REVENUE     — revenue:bot_runtime, revenue:adapter_usage, etc.
 *   EXPENSES    — expense:signup_grant, expense:admin_grant, expense:promo, etc.
 *   EQUITY      — retained_earnings
 */

import crypto from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { PlatformDb } from "../db/index.js";
import { accountBalances, accounts, journalEntries, journalLines } from "../db/schema/ledger.js";
import { Credit } from "./credit.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditType =
  | "signup_grant"
  | "admin_grant"
  | "purchase"
  | "bounty"
  | "referral"
  | "promo"
  | "community_dividend"
  | "affiliate_bonus"
  | "affiliate_match"
  | "correction";

export type DebitType =
  | "bot_runtime"
  | "adapter_usage"
  | "addon"
  | "refund"
  | "correction"
  | "resource_upgrade"
  | "storage_upgrade"
  | "onboarding_llm"
  | "credit_expiry";

export type TransactionType = CreditType | DebitType;

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type Side = "debit" | "credit";

export interface JournalLine {
  accountCode: string;
  amount: Credit;
  side: Side;
}

export interface PostEntryInput {
  entryType: string;
  tenantId: string;
  description?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  /** Override the posted_at timestamp (useful in tests to backdate entries). */
  postedAt?: string;
  lines: JournalLine[];
  /**
   * When set, verifies inside the transaction (after acquiring row locks) that
   * the tenant's balance >= amount. Throws InsufficientBalanceError otherwise.
   * Use this instead of a pre-check outside the transaction (TOCTOU-safe).
   */
  balanceCheck?: { tenantId: string; amount: Credit };
}

export interface JournalEntry {
  id: string;
  postedAt: string;
  entryType: string;
  tenantId: string;
  description: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
  lines: Array<{
    accountCode: string;
    amount: Credit;
    side: Side;
  }>;
}

/** Thrown when a debit would exceed a tenant's credit balance. */
export class InsufficientBalanceError extends Error {
  currentBalance: Credit;
  requestedAmount: Credit;

  constructor(currentBalance: Credit, requestedAmount: Credit) {
    super(
      `Insufficient balance: current ${currentBalance.toDisplayString()}, requested debit ${requestedAmount.toDisplayString()}`,
    );
    this.name = "InsufficientBalanceError";
    this.currentBalance = currentBalance;
    this.requestedAmount = requestedAmount;
  }
}

export interface HistoryOptions {
  limit?: number;
  offset?: number;
  type?: string;
}

export interface MemberUsageSummary {
  userId: string;
  totalDebit: Credit;
  transactionCount: number;
}

export interface TrialBalance {
  totalDebits: Credit;
  totalCredits: Credit;
  balanced: boolean;
  difference: Credit;
}

export interface CreditOpts {
  description?: string;
  referenceId?: string;
  fundingSource?: string;
  stripeFingerprint?: string;
  attributedUserId?: string;
  expiresAt?: string;
  createdBy?: string;
}

export interface DebitOpts {
  description?: string;
  referenceId?: string;
  allowNegative?: boolean;
  attributedUserId?: string;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Account code mappings
// ---------------------------------------------------------------------------

/** Maps credit (money-in) types to the debit-side account code. */
export const CREDIT_TYPE_ACCOUNT: Record<CreditType, string> = {
  purchase: "1000", // DR cash
  signup_grant: "5000", // DR expense:signup_grant
  admin_grant: "5010", // DR expense:admin_grant
  promo: "5020", // DR expense:promo
  referral: "5030", // DR expense:referral
  affiliate_bonus: "5040", // DR expense:affiliate
  affiliate_match: "5040", // DR expense:affiliate
  bounty: "5050", // DR expense:bounty
  community_dividend: "5060", // DR expense:dividend
  correction: "5070", // DR expense:correction
};

/** Maps debit (money-out) types to the credit-side account code. */
export const DEBIT_TYPE_ACCOUNT: Record<DebitType, string> = {
  bot_runtime: "4000", // CR revenue:bot_runtime
  adapter_usage: "4010", // CR revenue:adapter_usage
  addon: "4020", // CR revenue:addon
  storage_upgrade: "4030", // CR revenue:storage_upgrade
  resource_upgrade: "4040", // CR revenue:resource_upgrade
  onboarding_llm: "4050", // CR revenue:onboarding_llm
  credit_expiry: "4060", // CR revenue:expired
  refund: "1000", // CR cash (money out)
  correction: "5070", // CR expense:correction
};

/**
 * Entry types eligible for credit expiry (allowlist).
 * Only journal entries with these types can be returned by expiredCredits().
 * Derived from CreditType — if you add a new CreditType, add it here too.
 */
export const EXPIRABLE_CREDIT_TYPES = [
  "signup_grant",
  "admin_grant",
  "purchase",
  "bounty",
  "referral",
  "promo",
  "community_dividend",
  "affiliate_bonus",
  "affiliate_match",
  "correction",
] as const satisfies readonly CreditType[];

// ---------------------------------------------------------------------------
// System account seeds
// ---------------------------------------------------------------------------

export interface SystemAccount {
  code: string;
  name: string;
  type: AccountType;
  normalSide: Side;
}

export const SYSTEM_ACCOUNTS: SystemAccount[] = [
  // Assets
  { code: "1000", name: "Cash", type: "asset", normalSide: "debit" },
  { code: "1100", name: "Stripe Receivable", type: "asset", normalSide: "debit" },
  // Equity
  { code: "3000", name: "Retained Earnings", type: "equity", normalSide: "credit" },
  // Revenue
  { code: "4000", name: "Revenue: Bot Runtime", type: "revenue", normalSide: "credit" },
  { code: "4010", name: "Revenue: Adapter Usage", type: "revenue", normalSide: "credit" },
  { code: "4020", name: "Revenue: Addon", type: "revenue", normalSide: "credit" },
  { code: "4030", name: "Revenue: Storage Upgrade", type: "revenue", normalSide: "credit" },
  { code: "4040", name: "Revenue: Resource Upgrade", type: "revenue", normalSide: "credit" },
  { code: "4050", name: "Revenue: Onboarding LLM", type: "revenue", normalSide: "credit" },
  { code: "4060", name: "Revenue: Expired Credits", type: "revenue", normalSide: "credit" },
  // Expenses
  { code: "5000", name: "Expense: Signup Grant", type: "expense", normalSide: "debit" },
  { code: "5010", name: "Expense: Admin Grant", type: "expense", normalSide: "debit" },
  { code: "5020", name: "Expense: Promo", type: "expense", normalSide: "debit" },
  { code: "5030", name: "Expense: Referral", type: "expense", normalSide: "debit" },
  { code: "5040", name: "Expense: Affiliate", type: "expense", normalSide: "debit" },
  { code: "5050", name: "Expense: Bounty", type: "expense", normalSide: "debit" },
  { code: "5060", name: "Expense: Dividend", type: "expense", normalSide: "debit" },
  { code: "5070", name: "Expense: Correction", type: "expense", normalSide: "debit" },
];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ILedger {
  /** Post a balanced journal entry. The primitive. Everything else calls this. */
  post(input: PostEntryInput): Promise<JournalEntry>;

  /** Add credits to a tenant (posts balanced entry: DR source, CR unearned_revenue). */
  credit(tenantId: string, amount: Credit, type: CreditType, opts?: CreditOpts): Promise<JournalEntry>;

  /** Deduct credits from a tenant (posts balanced entry: DR unearned_revenue, CR revenue). */
  debit(tenantId: string, amount: Credit, type: DebitType, opts?: DebitOpts): Promise<JournalEntry>;

  /** Tenant's credit balance (= their unearned_revenue liability account balance). */
  balance(tenantId: string): Promise<Credit>;

  /** Check if a reference ID has already been posted (idempotency). */
  hasReferenceId(referenceId: string): Promise<boolean>;

  /** Journal entries for a tenant, newest first. */
  history(tenantId: string, opts?: HistoryOptions): Promise<JournalEntry[]>;

  /** All tenants with positive credit balance. */
  tenantsWithBalance(): Promise<Array<{ tenantId: string; balance: Credit }>>;

  /** Per-member debit totals for a tenant. */
  memberUsage(tenantId: string): Promise<MemberUsageSummary[]>;

  /** Sum of all debits for a tenant (absolute value). */
  lifetimeSpend(tenantId: string): Promise<Credit>;

  /** Batch lifetimeSpend for multiple tenants. */
  lifetimeSpendBatch(tenantIds: string[]): Promise<Map<string, Credit>>;

  /** Expired credit grants not yet clawed back. */
  expiredCredits(now: string): Promise<Array<{ entryId: string; tenantId: string; amount: Credit }>>;

  /** Verify the books balance: total debits === total credits across all lines. */
  trialBalance(): Promise<TrialBalance>;

  /** Balance of any account by code. */
  accountBalance(accountCode: string): Promise<Credit>;

  /** Ensure system accounts exist (idempotent, called at startup). */
  seedSystemAccounts(): Promise<void>;

  /** Check if any journal entry has a referenceId matching a LIKE pattern (for dividend idempotency). */
  existsByReferenceIdLike(pattern: string): Promise<boolean>;

  /** Sum all purchase-type entry amounts credited to tenant accounts in [startTs, endTs). */
  sumPurchasesForPeriod(startTs: string, endTs: string): Promise<Credit>;

  /** Get distinct tenantIds with a purchase entry in [startTs, endTs). */
  getActiveTenantIdsInWindow(startTs: string, endTs: string): Promise<string[]>;

  /**
   * Debit up to maxAmount from a tenant, capped at their current balance.
   * Reads balance inside the transaction (TOCTOU-safe). Returns null if
   * balance is zero (nothing to debit).
   */
  debitCapped(tenantId: string, maxAmount: Credit, type: DebitType, opts?: DebitOpts): Promise<JournalEntry | null>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleLedger implements ILedger {
  constructor(private readonly db: PlatformDb) {}

  // -- Account management --------------------------------------------------

  async seedSystemAccounts(): Promise<void> {
    for (const acct of SYSTEM_ACCOUNTS) {
      await this.db
        .insert(accounts)
        .values({
          id: crypto.randomUUID(),
          code: acct.code,
          name: acct.name,
          type: acct.type,
          normalSide: acct.normalSide,
          tenantId: null,
        })
        .onConflictDoNothing({ target: accounts.code });
    }
  }

  /**
   * Get or create the per-tenant unearned_revenue liability account, then lock
   * it for the duration of the surrounding transaction.
   * Code format: `2000:<tenantId>`
   *
   * Uses INSERT ON CONFLICT DO NOTHING so concurrent first-time calls for the
   * same tenant are idempotent (no unique-constraint crash on the second writer).
   */
  private async ensureTenantAccountLocked(
    tx: Parameters<Parameters<PlatformDb["transaction"]>[0]>[0],
    tenantId: string,
  ): Promise<string> {
    const code = `2000:${tenantId}`;
    // Idempotent upsert — safe under concurrent first-time creation.
    await tx
      .insert(accounts)
      .values({
        id: crypto.randomUUID(),
        code,
        name: `Unearned Revenue: ${tenantId}`,
        type: "liability",
        normalSide: "credit",
        tenantId,
      })
      .onConflictDoNothing({ target: accounts.code });
    // resolveAccountLocked acquires FOR UPDATE on the account row and ensures
    // the account_balances row exists, serializing concurrent balance updates.
    return this.resolveAccountLocked(tx, code);
  }

  /**
   * Resolve account code → account id.
   * Acquires FOR UPDATE locks on both the accounts row and the account_balances
   * row so concurrent transactions are fully serialized on balance reads/writes.
   */
  private async resolveAccountLocked(
    tx: Parameters<Parameters<PlatformDb["transaction"]>[0]>[0],
    code: string,
  ): Promise<string> {
    const rows = (await tx.execute(sql`SELECT id FROM accounts WHERE code = ${code} FOR UPDATE`)) as unknown as {
      rows: Array<{ id: string }>;
    };

    const id = rows.rows[0]?.id;
    if (!id) throw new Error(`Account not found: ${code}`);

    // Ensure balance row exists then lock it — serializes concurrent balance updates.
    await tx
      .insert(accountBalances)
      .values({ accountId: id, balance: 0 })
      .onConflictDoNothing({ target: accountBalances.accountId });
    await tx.execute(sql`SELECT balance FROM account_balances WHERE account_id = ${id} FOR UPDATE`);

    return id;
  }

  // -- The primitive: post() -----------------------------------------------

  async post(input: PostEntryInput): Promise<JournalEntry> {
    if (input.lines.length < 2) {
      throw new Error("Journal entry must have at least 2 lines");
    }

    // Verify balance before hitting DB
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const line of input.lines) {
      if (line.amount.isZero() || line.amount.isNegative()) {
        throw new Error("Journal line amounts must be positive");
      }
      if (line.side === "debit") totalDebit += BigInt(line.amount.toRaw());
      else totalCredit += BigInt(line.amount.toRaw());
    }
    if (totalDebit !== totalCredit) {
      const fmtDebit =
        totalDebit <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Credit.fromRaw(Number(totalDebit)).toDisplayString()
          : `${totalDebit} raw`;
      const fmtCredit =
        totalCredit <= BigInt(Number.MAX_SAFE_INTEGER)
          ? Credit.fromRaw(Number(totalCredit)).toDisplayString()
          : `${totalCredit} raw`;
      throw new Error(`Unbalanced entry: debits=${fmtDebit}, credits=${fmtCredit}`);
    }

    return this.db.transaction(async (tx) => {
      const entryId = crypto.randomUUID();
      const now = input.postedAt ?? new Date().toISOString();

      // Insert journal entry header
      await tx.insert(journalEntries).values({
        id: entryId,
        postedAt: now,
        entryType: input.entryType,
        description: input.description ?? null,
        referenceId: input.referenceId ?? null,
        tenantId: input.tenantId,
        metadata: input.metadata ?? null,
        createdBy: input.createdBy ?? null,
      });

      // Phase 1: resolve all account IDs with row locks so concurrent transactions
      // are serialized before any balance check or update.
      // Sort by accountCode to establish a consistent global lock ordering and
      // prevent deadlocks when concurrent transactions lock overlapping accounts.
      const sortedLines = [...input.lines].sort((a, b) =>
        a.accountCode < b.accountCode ? -1 : a.accountCode > b.accountCode ? 1 : 0,
      );
      const resolvedLines: Array<JournalLine & { accountId: string }> = [];
      for (const line of sortedLines) {
        let accountId: string;
        if (line.accountCode.startsWith("2000:")) {
          accountId = await this.ensureTenantAccountLocked(tx, line.accountCode.slice(5));
        } else {
          accountId = await this.resolveAccountLocked(tx, line.accountCode);
        }
        resolvedLines.push({ ...line, accountId });
      }

      // Phase 2: balance check inside the transaction (TOCTOU-safe).
      // Locks are already held on both the account and account_balances rows.
      if (input.balanceCheck) {
        const { tenantId, amount } = input.balanceCheck;
        const tenantAccountCode = `2000:${tenantId}`;
        const balRows = (await tx.execute(
          sql`SELECT ab.balance FROM account_balances ab
              INNER JOIN accounts a ON a.id = ab.account_id
              WHERE a.code = ${tenantAccountCode}`,
        )) as unknown as { rows: Array<{ balance: number }> };
        const currentBalance = Credit.fromRaw(Number(balRows.rows[0]?.balance ?? 0));
        if (currentBalance.lessThan(amount)) {
          throw new InsufficientBalanceError(currentBalance, amount);
        }
      }

      // Phase 3: insert lines + update balances
      const resultLines: JournalEntry["lines"] = [];
      for (const line of resolvedLines) {
        const { accountId } = line;

        const lineId = crypto.randomUUID();
        await tx.insert(journalLines).values({
          id: lineId,
          journalEntryId: entryId,
          accountId,
          amount: line.amount.toRaw(),
          side: line.side,
        });

        // Update materialized balance
        // For normal_side=debit accounts: balance += debit, balance -= credit
        // For normal_side=credit accounts: balance += credit, balance -= debit
        // We store balance in "normal" direction, so:
        const acctRow = (await tx.execute(
          sql`SELECT normal_side FROM accounts WHERE id = ${accountId}`,
        )) as unknown as {
          rows: Array<{ normal_side: Side }>;
        };
        const normalSide = acctRow.rows[0]?.normal_side;
        if (!normalSide) throw new Error(`Account ${accountId} missing normal_side`);

        const delta = line.side === normalSide ? line.amount.toRaw() : -line.amount.toRaw();

        await tx
          .update(accountBalances)
          .set({
            balance: sql`${accountBalances.balance} + ${delta}`,
            lastUpdated: sql`(now())`,
          })
          .where(eq(accountBalances.accountId, accountId));

        resultLines.push({
          accountCode: line.accountCode,
          amount: line.amount,
          side: line.side,
        });
      }

      return {
        id: entryId,
        postedAt: now,
        entryType: input.entryType,
        tenantId: input.tenantId,
        description: input.description ?? null,
        referenceId: input.referenceId ?? null,
        metadata: (input.metadata as Record<string, unknown>) ?? null,
        lines: resultLines,
      };
    });
  }

  // -- Convenience: credit() / debit() ------------------------------------

  async credit(tenantId: string, amount: Credit, type: CreditType, opts?: CreditOpts): Promise<JournalEntry> {
    if (amount.isZero() || amount.isNegative()) {
      throw new Error("amount must be positive for credits");
    }

    const debitAccount = CREDIT_TYPE_ACCOUNT[type];
    const tenantAccount = `2000:${tenantId}`;

    return this.post({
      entryType: type,
      tenantId,
      description: opts?.description,
      referenceId: opts?.referenceId,
      metadata: {
        fundingSource: opts?.fundingSource ?? null,
        stripeFingerprint: opts?.stripeFingerprint ?? null,
        attributedUserId: opts?.attributedUserId ?? null,
        expiresAt: opts?.expiresAt ?? null,
      },
      createdBy: opts?.createdBy ?? "system",
      lines: [
        { accountCode: debitAccount, amount, side: "debit" },
        { accountCode: tenantAccount, amount, side: "credit" },
      ],
    });
  }

  async debit(tenantId: string, amount: Credit, type: DebitType, opts?: DebitOpts): Promise<JournalEntry> {
    if (amount.isZero() || amount.isNegative()) {
      throw new Error("amount must be positive for debits");
    }

    const creditAccount = DEBIT_TYPE_ACCOUNT[type];
    const tenantAccount = `2000:${tenantId}`;

    return this.post({
      entryType: type,
      tenantId,
      description: opts?.description,
      referenceId: opts?.referenceId,
      metadata: {
        attributedUserId: opts?.attributedUserId ?? null,
      },
      createdBy: opts?.createdBy ?? "system",
      // Balance check happens inside the transaction after acquiring row locks
      // (TOCTOU-safe: prevents overdraft under concurrent debit operations).
      balanceCheck: opts?.allowNegative ? undefined : { tenantId, amount },
      lines: [
        { accountCode: tenantAccount, amount, side: "debit" },
        { accountCode: creditAccount, amount, side: "credit" },
      ],
    });
  }

  async debitCapped(
    tenantId: string,
    maxAmount: Credit,
    type: DebitType,
    opts?: DebitOpts,
  ): Promise<JournalEntry | null> {
    const creditAccountCode = DEBIT_TYPE_ACCOUNT[type];
    const tenantAccountCode = `2000:${tenantId}`;

    // Everything happens inside ONE transaction so the FOR UPDATE lock is held
    // continuously from balance read through journal posting (TOCTOU-safe).
    return this.db.transaction(async (tx) => {
      // Step 1: Lock BOTH accounts in accountCode-sorted order to match post()'s
      // lock ordering and prevent ABBA deadlocks. For type="refund" the credit
      // account is "1000" which sorts before "2000:<tenant>", so we must lock it
      // first — the same order post() would use.
      const sortedCodes = [tenantAccountCode, creditAccountCode].sort();
      const lockedIds = new Map<string, string>();
      for (const code of sortedCodes) {
        if (code.startsWith("2000:")) {
          lockedIds.set(code, await this.ensureTenantAccountLocked(tx, code.slice(5)));
        } else {
          lockedIds.set(code, await this.resolveAccountLocked(tx, code));
        }
      }
      const tenantAccountId = lockedIds.get(tenantAccountCode);
      const creditAccountId = lockedIds.get(creditAccountCode);
      if (!tenantAccountId || !creditAccountId) {
        throw new Error("Failed to resolve account IDs during debitCapped");
      }

      // Step 2: Read balance while holding the lock.
      const balRows = (await tx.execute(
        sql`SELECT ab.balance FROM account_balances ab
            INNER JOIN accounts a ON a.id = ab.account_id
            WHERE a.code = ${tenantAccountCode}`,
      )) as unknown as { rows: Array<{ balance: number }> };
      const currentBalance = Credit.fromRaw(Number(balRows.rows[0]?.balance ?? 0));

      if (currentBalance.isZero()) {
        return null;
      }

      // Step 3: Cap at lesser of maxAmount and currentBalance.
      const debitAmount = currentBalance.lessThan(maxAmount) ? currentBalance : maxAmount;

      // Step 4: Insert journal entry header.
      const entryId = crypto.randomUUID();
      const now = new Date().toISOString();

      await tx.insert(journalEntries).values({
        id: entryId,
        postedAt: now,
        entryType: type,
        description: opts?.description ?? null,
        referenceId: opts?.referenceId ?? null,
        tenantId,
        metadata: { attributedUserId: opts?.attributedUserId ?? null },
        createdBy: opts?.createdBy ?? "system",
      });

      // Step 5: Both accounts already locked in step 1 — no additional locking needed.

      // Step 6: Insert journal lines.
      // Debit line (tenant liability account — reduces balance)
      const debitLineId = crypto.randomUUID();
      await tx.insert(journalLines).values({
        id: debitLineId,
        journalEntryId: entryId,
        accountId: tenantAccountId,
        amount: debitAmount.toRaw(),
        side: "debit",
      });

      // Credit line (revenue/target account — increases balance)
      const creditLineId = crypto.randomUUID();
      await tx.insert(journalLines).values({
        id: creditLineId,
        journalEntryId: entryId,
        accountId: creditAccountId,
        amount: debitAmount.toRaw(),
        side: "credit",
      });

      // Step 7: Update materialized balances.
      // Tenant account is liability (normal_side=credit): debit decreases balance.
      await tx
        .update(accountBalances)
        .set({
          balance: sql`${accountBalances.balance} + ${-debitAmount.toRaw()}`,
          lastUpdated: sql`(now())`,
        })
        .where(eq(accountBalances.accountId, tenantAccountId));

      // Credit-side account: look up its normal_side to determine delta direction.
      const acctRow = (await tx.execute(
        sql`SELECT normal_side FROM accounts WHERE id = ${creditAccountId}`,
      )) as unknown as {
        rows: Array<{ normal_side: Side }>;
      };
      const normalSide = acctRow.rows[0]?.normal_side;
      if (!normalSide) throw new Error(`Account ${creditAccountId} missing normal_side`);

      const creditDelta = "credit" === normalSide ? debitAmount.toRaw() : -debitAmount.toRaw();

      await tx
        .update(accountBalances)
        .set({
          balance: sql`${accountBalances.balance} + ${creditDelta}`,
          lastUpdated: sql`(now())`,
        })
        .where(eq(accountBalances.accountId, creditAccountId));

      // Step 8: Return the journal entry.
      return {
        id: entryId,
        postedAt: now,
        entryType: type,
        tenantId,
        description: opts?.description ?? null,
        referenceId: opts?.referenceId ?? null,
        metadata: { attributedUserId: opts?.attributedUserId ?? null } as Record<string, unknown>,
        lines: [
          { accountCode: tenantAccountCode, amount: debitAmount, side: "debit" as Side },
          { accountCode: creditAccountCode, amount: debitAmount, side: "credit" as Side },
        ],
      };
    });
  }

  // -- Queries -------------------------------------------------------------

  async balance(tenantId: string): Promise<Credit> {
    const code = `2000:${tenantId}`;
    const rows = await this.db
      .select({ balance: accountBalances.balance })
      .from(accountBalances)
      .innerJoin(accounts, eq(accounts.id, accountBalances.accountId))
      .where(eq(accounts.code, code));

    return rows[0] ? Credit.fromRaw(rows[0].balance) : Credit.ZERO;
  }

  async accountBalance(accountCode: string): Promise<Credit> {
    const rows = await this.db
      .select({ balance: accountBalances.balance })
      .from(accountBalances)
      .innerJoin(accounts, eq(accounts.id, accountBalances.accountId))
      .where(eq(accounts.code, accountCode));

    return rows[0] ? Credit.fromRaw(rows[0].balance) : Credit.ZERO;
  }

  async hasReferenceId(referenceId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(eq(journalEntries.referenceId, referenceId))
      .limit(1);
    return rows.length > 0;
  }

  async history(tenantId: string, opts: HistoryOptions = {}): Promise<JournalEntry[]> {
    const limit = Math.min(Math.max(1, opts.limit ?? 50), 250);
    const offset = Math.max(0, opts.offset ?? 0);

    const conditions = [eq(journalEntries.tenantId, tenantId)];
    if (opts.type) {
      conditions.push(eq(journalEntries.entryType, opts.type));
    }

    const entries = await this.db
      .select()
      .from(journalEntries)
      .where(and(...conditions))
      .orderBy(sql`${journalEntries.postedAt} DESC`)
      .limit(limit)
      .offset(offset);

    // Batch-fetch lines for all entries
    const entryIds = entries.map((e) => e.id);
    if (entryIds.length === 0) return [];

    const allLines = await this.db
      .select({
        journalEntryId: journalLines.journalEntryId,
        accountCode: accounts.code,
        amount: journalLines.amount,
        side: journalLines.side,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(
        sql`${journalLines.journalEntryId} IN (${sql.join(
          entryIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    const linesByEntry = new Map<string, JournalEntry["lines"]>();
    for (const line of allLines) {
      const arr = linesByEntry.get(line.journalEntryId) ?? [];
      arr.push({
        accountCode: line.accountCode,
        amount: Credit.fromRaw(line.amount),
        side: line.side,
      });
      linesByEntry.set(line.journalEntryId, arr);
    }

    return entries.map((e) => ({
      id: e.id,
      postedAt: e.postedAt,
      entryType: e.entryType,
      tenantId: e.tenantId,
      description: e.description,
      referenceId: e.referenceId,
      metadata: e.metadata as Record<string, unknown> | null,
      lines: linesByEntry.get(e.id) ?? [],
    }));
  }

  async tenantsWithBalance(): Promise<Array<{ tenantId: string; balance: Credit }>> {
    const rows = await this.db
      .select({
        tenantId: accounts.tenantId,
        balance: accountBalances.balance,
      })
      .from(accountBalances)
      .innerJoin(accounts, eq(accounts.id, accountBalances.accountId))
      .where(and(isNotNull(accounts.tenantId), eq(accounts.type, "liability"), sql`${accountBalances.balance} > 0`));

    return rows
      .filter((r): r is typeof r & { tenantId: string } => r.tenantId != null)
      .map((r) => ({
        tenantId: r.tenantId,
        balance: Credit.fromRaw(r.balance),
      }));
  }

  async memberUsage(tenantId: string): Promise<MemberUsageSummary[]> {
    // Sum debit-side lines on the tenant's liability account, grouped by attributed_user_id
    const tenantAccount = `2000:${tenantId}`;
    const rows = await this.db
      .select({
        userId: sql<string>`(${journalEntries.metadata}->>'attributedUserId')`,
        totalDebitRaw: sql<number>`COALESCE(SUM(${journalLines.amount}), 0)`,
        transactionCount: sql<number>`COUNT(*)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(
        and(
          eq(accounts.code, tenantAccount),
          eq(journalLines.side, "debit"), // debits on liability = usage
          sql`${journalEntries.metadata}->>'attributedUserId' IS NOT NULL`,
        ),
      )
      .groupBy(sql`${journalEntries.metadata}->>'attributedUserId'`);

    return rows
      .filter((r) => r.userId != null)
      .map((r) => ({
        userId: r.userId,
        totalDebit: Credit.fromRaw(Number(r.totalDebitRaw)),
        // COUNT(*) returns bigint (serialized as string by the PG driver) — coerce to number.
        transactionCount: Number(r.transactionCount),
      }));
  }

  async lifetimeSpend(tenantId: string): Promise<Credit> {
    const tenantAccount = `2000:${tenantId}`;
    const rows = await this.db
      .select({
        totalRaw: sql<string>`COALESCE(SUM(${journalLines.amount}), 0)`,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(
        and(
          eq(accounts.code, tenantAccount),
          eq(journalLines.side, "debit"), // debits on liability = money out
        ),
      );

    const raw = BigInt(String(rows[0]?.totalRaw ?? 0));
    if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`lifetimeSpend overflow: ${raw}`);
    }
    return Credit.fromRaw(Number(raw));
  }

  async lifetimeSpendBatch(tenantIds: string[]): Promise<Map<string, Credit>> {
    if (tenantIds.length === 0) return new Map();

    const codes = tenantIds.map((id) => `2000:${id}`);
    const rows = await this.db
      .select({
        code: accounts.code,
        totalRaw: sql<string>`COALESCE(SUM(${journalLines.amount}), 0)`,
      })
      .from(journalLines)
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(
        and(
          sql`${accounts.code} IN (${sql.join(
            codes.map((c) => sql`${c}`),
            sql`, `,
          )})`,
          eq(journalLines.side, "debit"),
        ),
      )
      .groupBy(accounts.code);

    const result = new Map<string, Credit>();
    for (const row of rows) {
      const tenantId = row.code.slice(5); // strip '2000:'
      const raw = BigInt(String(row.totalRaw));
      if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`lifetimeSpend overflow for ${tenantId}: ${raw}`);
      }
      result.set(tenantId, Credit.fromRaw(Number(raw)));
    }
    for (const id of tenantIds) {
      if (!result.has(id)) result.set(id, Credit.ZERO);
    }
    return result;
  }

  async expiredCredits(now: string): Promise<Array<{ entryId: string; tenantId: string; amount: Credit }>> {
    // Find credit entries with expiresAt <= now that don't yet have a corresponding expiry entry
    const rows = await this.db
      .select({
        id: journalEntries.id,
        tenantId: journalEntries.tenantId,
        // The credit amount is on the tenant's liability line (credit side)
        amount: sql<number>`(
					SELECT jl.amount FROM journal_lines jl
					INNER JOIN accounts a ON a.id = jl.account_id
					WHERE jl.journal_entry_id = "journal_entries"."id"
					AND a.type = 'liability'
					AND jl.side = 'credit'
					LIMIT 1
				)`,
      })
      .from(journalEntries)
      .where(
        and(
          isNotNull(sql`${journalEntries.metadata}->>'expiresAt'`),
          sql`(${journalEntries.metadata}->>'expiresAt') <= ${now}`,
          sql`${journalEntries.entryType} IN (${sql.join(
            EXPIRABLE_CREDIT_TYPES.map((t) => sql`${t}`),
            sql`, `,
          )})`,
        ),
      );

    const result: Array<{ entryId: string; tenantId: string; amount: Credit }> = [];
    for (const row of rows) {
      if (!row.amount) continue;
      // Check if already expired (idempotency)
      if (await this.hasReferenceId(`expiry:${row.id}`)) continue;
      result.push({
        entryId: row.id,
        tenantId: row.tenantId,
        amount: Credit.fromRaw(row.amount),
      });
    }
    return result;
  }

  async existsByReferenceIdLike(pattern: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(sql`${journalEntries.referenceId} LIKE ${pattern}`)
      .limit(1);
    return rows.length > 0;
  }

  async sumPurchasesForPeriod(startTs: string, endTs: string): Promise<Credit> {
    // Sum the credit-side amounts on tenant liability accounts for purchase entries in range.
    const rows = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${journalLines.amount}), 0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .where(
        and(
          eq(journalEntries.entryType, "purchase"),
          eq(journalLines.side, "credit"),
          eq(accounts.type, "liability"),
          // Cast to timestamptz for correct chronological comparison regardless of format/TZ.
          sql`${journalEntries.postedAt}::timestamptz >= ${startTs}::timestamptz`,
          sql`${journalEntries.postedAt}::timestamptz < ${endTs}::timestamptz`,
        ),
      );
    // Use BigInt to avoid silent precision loss for large totals (same pattern as lifetimeSpend).
    const raw = BigInt(String(rows[0]?.total ?? 0));
    if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`sumPurchasesForPeriod overflow: ${raw}`);
    }
    return Credit.fromRaw(Number(raw));
  }

  async getActiveTenantIdsInWindow(startTs: string, endTs: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ tenantId: journalEntries.tenantId })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.entryType, "purchase"),
          // Cast to timestamptz for correct chronological comparison.
          sql`${journalEntries.postedAt}::timestamptz >= ${startTs}::timestamptz`,
          sql`${journalEntries.postedAt}::timestamptz < ${endTs}::timestamptz`,
        ),
      );
    return rows.map((r) => r.tenantId);
  }

  // -- Audit ---------------------------------------------------------------

  async trialBalance(): Promise<TrialBalance> {
    const rows = await this.db
      .select({
        side: journalLines.side,
        total: sql<string>`COALESCE(SUM(${journalLines.amount}), 0)`,
      })
      .from(journalLines)
      .groupBy(journalLines.side);

    let totalDebitsBig = 0n;
    let totalCreditsBig = 0n;
    for (const row of rows) {
      if (row.side === "debit") totalDebitsBig = BigInt(String(row.total));
      else totalCreditsBig = BigInt(String(row.total));
    }

    const diff = totalDebitsBig > totalCreditsBig ? totalDebitsBig - totalCreditsBig : totalCreditsBig - totalDebitsBig;

    if (totalDebitsBig > BigInt(Number.MAX_SAFE_INTEGER) || totalCreditsBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`trialBalance overflow: debits=${totalDebitsBig}, credits=${totalCreditsBig}`);
    }

    return {
      totalDebits: Credit.fromRaw(Number(totalDebitsBig)),
      totalCredits: Credit.fromRaw(Number(totalCreditsBig)),
      balanced: totalDebitsBig === totalCreditsBig,
      difference: Credit.fromRaw(Number(diff)),
    };
  }
}

// Backward-compat alias
export { DrizzleLedger as Ledger };
