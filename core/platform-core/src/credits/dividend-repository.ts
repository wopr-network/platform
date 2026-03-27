import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { PlatformDb } from "../db/index.js";
import { adminUsers } from "../db/schema/admin-users.js";
import { dividendDistributions } from "../db/schema/dividend-distributions.js";
import { journalEntries, journalLines } from "../db/schema/ledger.js";
import { Credit } from "./credit.js";
import type { DividendHistoryEntry, DividendStats } from "./repository-types.js";

export type { DividendHistoryEntry, DividendStats };

export interface DigestTenantRow {
  tenantId: string;
  total: Credit;
  distributionCount: number;
  avgPool: Credit;
  avgActiveUsers: number;
}

export interface IDividendRepository {
  getStats(tenantId: string): Promise<DividendStats>;
  getHistory(tenantId: string, limit: number, offset: number): Promise<DividendHistoryEntry[]>;
  getLifetimeTotal(tenantId: string): Promise<Credit>;
  /** Aggregate dividend distributions per tenant for a date window [windowStart, windowEnd). */
  getDigestTenantAggregates(windowStart: string, windowEnd: string): Promise<DigestTenantRow[]>;
  /** Resolve email for a tenant from admin_users. Returns undefined if no row exists. */
  getTenantEmail(tenantId: string): Promise<string | undefined>;
}

export class DrizzleDividendRepository implements IDividendRepository {
  constructor(private readonly db: PlatformDb) {}

  async getStats(tenantId: string): Promise<DividendStats> {
    // 1. Pool = sum of purchase credit amounts from yesterday UTC
    // In double-entry: purchase entries have a credit line on the tenant liability account.
    // Sum those credit line amounts for entries posted yesterday.
    const poolRow = (
      await this.db
        .select({ total: sql<string>`COALESCE(SUM(${journalLines.amount}), 0)` })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
        .where(
          and(
            eq(journalEntries.entryType, "purchase"),
            eq(journalLines.side, "credit"),
            // raw SQL: Drizzle cannot express date_trunc with interval arithmetic
            sql`${journalEntries.postedAt}::timestamp >= date_trunc('day', timezone('UTC', now())) - INTERVAL '1 day'`,
            sql`${journalEntries.postedAt}::timestamp < date_trunc('day', timezone('UTC', now()))`,
          ),
        )
    )[0];
    const pool = Credit.fromRaw(Number(poolRow?.total ?? 0));

    // 2. Active users = distinct tenants with a purchase in the last 7 days
    const activeRow = (
      await this.db
        .select({ count: sql<number>`COUNT(DISTINCT ${journalEntries.tenantId})` })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.entryType, "purchase"),
            // raw SQL: Drizzle cannot express timestamp comparison with interval arithmetic
            sql`${journalEntries.postedAt}::timestamp >= timezone('UTC', now()) - INTERVAL '7 days'`,
          ),
        )
    )[0];
    const activeUsers = activeRow?.count ?? 0;

    // 3. Per-user projection (avoid division by zero)
    const perUser = activeUsers > 0 ? Credit.fromRaw(Math.floor(pool.toRaw() / activeUsers)) : Credit.ZERO;

    // 4. Next distribution = midnight UTC tonight
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const nextDistributionAt = nextMidnight.toISOString();

    // 5. User eligibility — last purchase within 7 days
    const userPurchaseRow = (
      await this.db
        .select({ postedAt: journalEntries.postedAt })
        .from(journalEntries)
        .where(and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.entryType, "purchase")))
        .orderBy(desc(journalEntries.postedAt))
        .limit(1)
    )[0];

    let userEligible = false;
    let userLastPurchaseAt: string | null = null;
    let userWindowExpiresAt: string | null = null;

    if (userPurchaseRow) {
      const lastPurchase = new Date(userPurchaseRow.postedAt);
      userLastPurchaseAt = lastPurchase.toISOString();

      const windowExpiry = new Date(lastPurchase.getTime() + 7 * 24 * 60 * 60 * 1000);
      userWindowExpiresAt = windowExpiry.toISOString();

      userEligible = windowExpiry.getTime() > Date.now();
    }

    return {
      pool,
      activeUsers,
      perUser,
      nextDistributionAt,
      userEligible,
      userLastPurchaseAt,
      userWindowExpiresAt,
    };
  }

  async getHistory(tenantId: string, limit: number, offset: number): Promise<DividendHistoryEntry[]> {
    const safeLimit = Math.min(Math.max(1, limit), 250);
    const safeOffset = Math.max(0, offset);

    const rows = await this.db
      .select({
        date: dividendDistributions.date,
        amountCents: dividendDistributions.amountCents,
        poolCents: dividendDistributions.poolCents,
        activeUsers: dividendDistributions.activeUsers,
      })
      .from(dividendDistributions)
      .where(eq(dividendDistributions.tenantId, tenantId))
      .orderBy(desc(dividendDistributions.date))
      .limit(safeLimit)
      .offset(safeOffset);

    return rows.map((row) => ({
      date: row.date,
      amount: Credit.fromCents(row.amountCents),
      pool: Credit.fromCents(row.poolCents),
      activeUsers: row.activeUsers,
    }));
  }

  async getLifetimeTotal(tenantId: string): Promise<Credit> {
    const row = (
      await this.db
        // raw SQL: Drizzle cannot express COALESCE(SUM(...), 0) aggregate
        .select({ total: sql<number>`COALESCE(SUM(${dividendDistributions.amountCents}), 0)` })
        .from(dividendDistributions)
        .where(eq(dividendDistributions.tenantId, tenantId))
    )[0];
    return Credit.fromCents(row?.total ?? 0);
  }

  async getDigestTenantAggregates(windowStart: string, windowEnd: string): Promise<DigestTenantRow[]> {
    const rows = await this.db
      .select({
        tenantId: dividendDistributions.tenantId,
        // raw SQL: Drizzle cannot express SUM/COUNT(DISTINCT)/AVG with CAST aggregates
        totalCents: sql<number>`SUM(${dividendDistributions.amountCents})`,
        distributionCount: sql<number>`COUNT(DISTINCT ${dividendDistributions.date})`,
        avgPoolCents: sql<number>`CAST(AVG(${dividendDistributions.poolCents}) AS INTEGER)`,
        avgActiveUsers: sql<number>`CAST(AVG(${dividendDistributions.activeUsers}) AS INTEGER)`,
      })
      .from(dividendDistributions)
      .where(and(gte(dividendDistributions.date, windowStart), lt(dividendDistributions.date, windowEnd)))
      .groupBy(dividendDistributions.tenantId);

    return rows.map((row) => ({
      tenantId: row.tenantId,
      total: Credit.fromCents(row.totalCents),
      distributionCount: row.distributionCount,
      avgPool: Credit.fromCents(row.avgPoolCents),
      avgActiveUsers: row.avgActiveUsers,
    }));
  }

  async getTenantEmail(tenantId: string): Promise<string | undefined> {
    const row = (
      await this.db
        .select({ email: adminUsers.email })
        .from(adminUsers)
        .where(eq(adminUsers.tenantId, tenantId))
        .limit(1)
    )[0];
    return row?.email;
  }
}
