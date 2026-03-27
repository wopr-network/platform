import { and, gte, lte } from "drizzle-orm";
import type { PlatformDb } from "../../db/index.js";
import { billingPeriodSummaries } from "../../db/schema/meter-events.js";

export interface BillingPeriodSummaryRow {
  id: string;
  tenant: string;
  capability: string;
  provider: string;
  eventCount: number;
  totalCost: number;
  totalCharge: number;
  totalDuration: number;
  periodStart: number;
  periodEnd: number;
  updatedAt: number;
}

export interface IBillingPeriodSummaryRepository {
  listByPeriodWindow(start: number, end: number): Promise<BillingPeriodSummaryRow[]>;
}

export class DrizzleBillingPeriodSummaryRepository implements IBillingPeriodSummaryRepository {
  constructor(private readonly db: PlatformDb) {}

  async listByPeriodWindow(start: number, end: number): Promise<BillingPeriodSummaryRow[]> {
    return this.db
      .select()
      .from(billingPeriodSummaries)
      .where(and(gte(billingPeriodSummaries.periodStart, start), lte(billingPeriodSummaries.periodEnd, end)));
  }
}
