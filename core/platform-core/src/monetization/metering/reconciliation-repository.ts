import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { DrizzleDb } from "../../db/index.js";
import { journalEntries, journalLines } from "../../db/schema/ledger.js";
import { usageSummaries } from "../../db/schema/meter-events.js";

// ---------------------------------------------------------------------------
// IUsageSummaryRepository
// ---------------------------------------------------------------------------

export interface AggregatedCharge {
  tenant: string;
  totalChargeRaw: number;
}

export interface IUsageSummaryRepository {
  /** Sum metered charges per tenant for windows overlapping [windowStart, windowEnd). */
  getAggregatedChargesByWindow(windowStart: number, windowEnd: number): Promise<AggregatedCharge[]>;
}

export class DrizzleUsageSummaryRepository implements IUsageSummaryRepository {
  constructor(private readonly db: DrizzleDb) {}

  async getAggregatedChargesByWindow(windowStart: number, windowEnd: number): Promise<AggregatedCharge[]> {
    const rows = await this.db
      .select({
        tenant: usageSummaries.tenant,
        // raw SQL: Drizzle cannot express COALESCE with SUM aggregation
        totalCharge: sql<number>`COALESCE(SUM(${usageSummaries.totalCharge}), 0)`,
      })
      .from(usageSummaries)
      .where(
        and(
          gte(usageSummaries.windowStart, windowStart),
          lt(usageSummaries.windowEnd, windowEnd),
          ne(usageSummaries.tenant, "__sentinel__"),
        ),
      )
      .groupBy(usageSummaries.tenant);

    return rows.map((r) => ({ tenant: r.tenant, totalChargeRaw: Number(r.totalCharge) }));
  }
}

// ---------------------------------------------------------------------------
// IAdapterUsageRepository
// ---------------------------------------------------------------------------

export interface AggregatedDebit {
  tenantId: string;
  totalDebitRaw: number;
}

export interface IAdapterUsageRepository {
  /** Sum adapter_usage debits per tenant within [startIso, endIso). */
  getAggregatedAdapterUsageDebits(startIso: string, endIso: string): Promise<AggregatedDebit[]>;
}

export class DrizzleAdapterUsageRepository implements IAdapterUsageRepository {
  constructor(private readonly db: DrizzleDb) {}

  async getAggregatedAdapterUsageDebits(startIso: string, endIso: string): Promise<AggregatedDebit[]> {
    // Sum the debit-side journal line amounts for adapter_usage entries.
    // In double-entry: DR tenant liability (2000:<tenantId>), CR revenue:adapter_usage (4010).
    const rows = await this.db
      .select({
        tenantId: journalEntries.tenantId,
        // raw SQL: Drizzle cannot express COALESCE with SUM aggregation
        totalDebitRaw: sql<number>`COALESCE(SUM(${journalLines.amount}), 0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.journalEntryId))
      .where(
        and(
          eq(journalEntries.entryType, "adapter_usage"),
          eq(journalLines.side, "debit"),
          // raw SQL: Drizzle cannot express timestamptz cast for text column date comparison
          sql`${journalEntries.postedAt}::timestamptz >= ${startIso}::timestamptz`,
          sql`${journalEntries.postedAt}::timestamptz < ${endIso}::timestamptz`,
        ),
      )
      .groupBy(journalEntries.tenantId);

    return rows.map((r) => ({ tenantId: r.tenantId, totalDebitRaw: Number(r.totalDebitRaw) }));
  }
}
