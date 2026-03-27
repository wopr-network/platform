import { and, eq, gte, lt } from "drizzle-orm";
import type { PlatformDb } from "../../db/index.js";
import { stripeUsageReports } from "../../db/schema/tenant-customers.js";

export interface StripeUsageReportRow {
  id: string;
  tenant: string;
  capability: string;
  provider: string;
  periodStart: number;
  periodEnd: number;
  eventName: string;
  valueCents: number;
  reportedAt: number;
}

export type StripeUsageReportInsert = StripeUsageReportRow;

export interface IStripeUsageReportRepository {
  insert(row: StripeUsageReportInsert): Promise<void>;
  getByTenantAndPeriod(
    tenant: string,
    capability: string,
    provider: string,
    periodStart: number,
  ): Promise<StripeUsageReportRow | null>;
  listByTenant(tenant: string, opts: { since: number; until: number }): Promise<StripeUsageReportRow[]>;
  listAll(opts: { since: number; until: number }): Promise<StripeUsageReportRow[]>;
}

export class DrizzleStripeUsageReportRepository implements IStripeUsageReportRepository {
  constructor(private readonly db: PlatformDb) {}

  async insert(row: StripeUsageReportInsert): Promise<void> {
    await this.db.insert(stripeUsageReports).values(row);
  }

  async getByTenantAndPeriod(
    tenant: string,
    capability: string,
    provider: string,
    periodStart: number,
  ): Promise<StripeUsageReportRow | null> {
    const rows = await this.db
      .select()
      .from(stripeUsageReports)
      .where(
        and(
          eq(stripeUsageReports.tenant, tenant),
          eq(stripeUsageReports.capability, capability),
          eq(stripeUsageReports.provider, provider),
          eq(stripeUsageReports.periodStart, periodStart),
        ),
      );
    return rows[0] ?? null;
  }

  async listByTenant(tenant: string, opts: { since: number; until: number }): Promise<StripeUsageReportRow[]> {
    return this.db
      .select()
      .from(stripeUsageReports)
      .where(
        and(
          eq(stripeUsageReports.tenant, tenant),
          gte(stripeUsageReports.reportedAt, opts.since),
          lt(stripeUsageReports.reportedAt, opts.until),
        ),
      );
  }

  async listAll(opts: { since: number; until: number }): Promise<StripeUsageReportRow[]> {
    return this.db
      .select()
      .from(stripeUsageReports)
      .where(and(gte(stripeUsageReports.reportedAt, opts.since), lt(stripeUsageReports.reportedAt, opts.until)));
  }
}
