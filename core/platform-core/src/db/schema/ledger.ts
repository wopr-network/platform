import { sql } from "drizzle-orm";
import { bigint, index, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", ["asset", "liability", "equity", "revenue", "expense"]);

export const entrySideEnum = pgEnum("entry_side", ["debit", "credit"]);

/**
 * Chart of accounts — every account that can appear in a journal line.
 *
 * System accounts (tenant_id IS NULL) are seeded at migration time.
 * Per-tenant liability accounts are created lazily on first transaction.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    normalSide: entrySideEnum("normal_side").notNull(),
    tenantId: text("tenant_id"), // NULL = system account
    createdAt: text("created_at").notNull().default(sql`(now())`),
  },
  (table) => [
    uniqueIndex("idx_accounts_code").on(table.code),
    index("idx_accounts_tenant").on(table.tenantId).where(sql`${table.tenantId} IS NOT NULL`),
    index("idx_accounts_type").on(table.type),
  ],
);

/**
 * Journal entries — the header for each balanced transaction.
 * One business event = one journal entry = two or more journal lines that sum to zero.
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    postedAt: text("posted_at").notNull().default(sql`(now())`),
    entryType: text("entry_type").notNull(), // purchase, usage, grant, refund, dividend, expiry, correction
    description: text("description"),
    referenceId: text("reference_id"),
    tenantId: text("tenant_id").notNull(),
    metadata: jsonb("metadata"), // funding_source, attributed_user_id, stripe_fingerprint, etc.
    createdBy: text("created_by"), // system, admin:<id>, cron:expiry, etc.
  },
  (table) => [
    uniqueIndex("idx_je_reference").on(table.referenceId).where(sql`${table.referenceId} IS NOT NULL`),
    index("idx_je_tenant").on(table.tenantId),
    index("idx_je_type").on(table.entryType),
    index("idx_je_posted").on(table.postedAt),
    index("idx_je_tenant_posted").on(table.tenantId, table.postedAt),
  ],
);

/**
 * Journal lines — the individual debits and credits within a journal entry.
 * Invariant: for every journal_entry, SUM(debit amounts) = SUM(credit amounts).
 * Amount is always positive; `side` determines the direction.
 * Stored in nanodollars (Credit.toRaw()).
 */
export const journalLines = pgTable(
  "journal_lines",
  {
    id: text("id").primaryKey(),
    journalEntryId: text("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    // mode: "number" truncates values > Number.MAX_SAFE_INTEGER (≈$9.007M in nanodollars).
    // Credit.fromRaw() guards against this with a RangeError.
    // If balances approach $9M, migrate to mode: "bigint" (returns string from Drizzle).
    amount: bigint("amount", { mode: "number" }).notNull(), // nanodollars, always positive
    side: entrySideEnum("side").notNull(),
  },
  (table) => [
    index("idx_jl_entry").on(table.journalEntryId),
    index("idx_jl_account").on(table.accountId),
    index("idx_jl_account_side").on(table.accountId, table.side),
  ],
);

/**
 * Materialized account balances — cache derived from journal_lines.
 * Updated atomically within the same transaction as the journal line insert.
 * Can always be reconstructed from journal_lines if corrupted.
 */
export const accountBalances = pgTable("account_balances", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  // mode: "number" truncates values > Number.MAX_SAFE_INTEGER (≈$9.007M in nanodollars).
  // Credit.fromRaw() guards against this with a RangeError.
  // If balances approach $9M, migrate to mode: "bigint" (returns string from Drizzle).
  balance: bigint("balance", { mode: "number" }).notNull().default(0), // net balance in nanodollars
  lastUpdated: text("last_updated").notNull().default(sql`(now())`),
});
