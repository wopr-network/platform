import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Credit } from "../../credits/credit.js";
import type { PlatformDb } from "../../db/index.js";
import { billingPeriodSummaries } from "../../db/schema/meter-events.js";
import { tenantCustomers } from "../../db/schema/tenant-customers.js";
import { createTestDb, truncateAllTables } from "../../test/db.js";
import { DrizzleBillingPeriodSummaryRepository } from "./billing-period-summary-repository.js";
import type { MeteredPriceConfig } from "./metered-price-map.js";
import { DrizzleTenantCustomerRepository } from "./tenant-store.js";
import { DrizzleStripeUsageReportRepository } from "./usage-report-repository.js";
import { runUsageReportWriter } from "./usage-report-writer.js";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("runUsageReportWriter", () => {
  let db: PlatformDb;
  let pool: import("@electric-sql/pglite").PGlite;
  let reportRepo: DrizzleStripeUsageReportRepository;
  let tenantRepo: DrizzleTenantCustomerRepository;
  let billingPeriodSummaryRepo: DrizzleBillingPeriodSummaryRepository;

  const NOW = Date.now();
  const PERIOD_START = 1700000000000;
  const PERIOD_END = 1700003600000;

  const mockCreateMeterEvent = vi.fn().mockResolvedValue({ identifier: "evt_xxx" });

  const mockStripe = {
    billing: {
      meterEvents: { create: mockCreateMeterEvent },
    },
  } as unknown as import("stripe").default;

  const priceMap = new Map<string, MeteredPriceConfig>([["chat-completions", { eventName: "chat_completions_usage" }]]);

  beforeAll(async () => {
    const t = await createTestDb();
    pool = t.pool;
    db = t.db;
    reportRepo = new DrizzleStripeUsageReportRepository(db);
    tenantRepo = new DrizzleTenantCustomerRepository(db);
    billingPeriodSummaryRepo = new DrizzleBillingPeriodSummaryRepository(db);
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await pool.close();
  });

  async function seedMeteredTenant(tenant: string) {
    await db.insert(tenantCustomers).values({
      tenant,
      processorCustomerId: `cus_${tenant}`,
      processor: "stripe",
      inferenceMode: "metered",
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  async function seedBillingPeriod(tenant: string, opts?: { capability?: string; totalCharge?: number }) {
    await db.insert(billingPeriodSummaries).values({
      id: crypto.randomUUID(),
      tenant,
      capability: opts?.capability ?? "chat-completions",
      provider: "openrouter",
      eventCount: 10,
      totalCost: opts?.totalCharge ?? Credit.fromCents(100).toRaw(),
      totalCharge: opts?.totalCharge ?? Credit.fromCents(100).toRaw(),
      totalDuration: 0,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      updatedAt: NOW,
    });
  }

  it("reports usage for metered tenants to Stripe and inserts local record", async () => {
    await seedMeteredTenant("t1");
    await seedBillingPeriod("t1");

    const result = await runUsageReportWriter({
      stripe: mockStripe,
      tenantRepo,
      billingPeriodSummaryRepo,
      usageReportRepo: reportRepo,
      meteredPriceMap: priceMap,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(result.reportsCreated).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockCreateMeterEvent).toHaveBeenCalledOnce();

    const stored = await reportRepo.getByTenantAndPeriod("t1", "chat-completions", "openrouter", PERIOD_START);
    expect(stored).toBeTruthy();
    expect(stored?.valueCents).toBe(100);
  });

  it("skips non-metered tenants", async () => {
    // Insert a managed-mode tenant
    await db.insert(tenantCustomers).values({
      tenant: "t2",
      processorCustomerId: "cus_t2",
      processor: "stripe",
      inferenceMode: "managed",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await seedBillingPeriod("t2");

    const result = await runUsageReportWriter({
      stripe: mockStripe,
      tenantRepo,
      billingPeriodSummaryRepo,
      usageReportRepo: reportRepo,
      meteredPriceMap: priceMap,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(result.tenantsProcessed).toBe(0);
    expect(mockCreateMeterEvent).not.toHaveBeenCalled();
  });

  it("skips already-reported periods (idempotent)", async () => {
    await seedMeteredTenant("t1");
    await seedBillingPeriod("t1");

    // Pre-insert a report for this period
    await reportRepo.insert({
      id: crypto.randomUUID(),
      tenant: "t1",
      capability: "chat-completions",
      provider: "openrouter",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      eventName: "chat_completions_usage",
      valueCents: 100,
      reportedAt: NOW,
    });

    const result = await runUsageReportWriter({
      stripe: mockStripe,
      tenantRepo,
      billingPeriodSummaryRepo,
      usageReportRepo: reportRepo,
      meteredPriceMap: priceMap,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(result.reportsSkipped).toBe(1);
    expect(result.reportsCreated).toBe(0);
    expect(mockCreateMeterEvent).not.toHaveBeenCalled();
  });

  it("skips zero-usage periods", async () => {
    await seedMeteredTenant("t1");
    await db.insert(billingPeriodSummaries).values({
      id: crypto.randomUUID(),
      tenant: "t1",
      capability: "chat-completions",
      provider: "openrouter",
      eventCount: 0,
      totalCost: 0,
      totalCharge: 0,
      totalDuration: 0,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      updatedAt: NOW,
    });

    const result = await runUsageReportWriter({
      stripe: mockStripe,
      tenantRepo,
      billingPeriodSummaryRepo,
      usageReportRepo: reportRepo,
      meteredPriceMap: priceMap,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(result.reportsCreated).toBe(0);
    expect(mockCreateMeterEvent).not.toHaveBeenCalled();
  });
});
