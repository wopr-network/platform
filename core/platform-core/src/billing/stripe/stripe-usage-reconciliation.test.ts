import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformDb } from "../../db/index.js";
import { createTestDb, truncateAllTables } from "../../test/db.js";
import { runStripeUsageReconciliation } from "./stripe-usage-reconciliation.js";
import { DrizzleStripeUsageReportRepository } from "./usage-report-repository.js";

vi.mock("../../config/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("runStripeUsageReconciliation", () => {
  let db: PlatformDb;
  let pool: import("@electric-sql/pglite").PGlite;
  let reportRepo: DrizzleStripeUsageReportRepository;

  const NOW = Date.now();

  beforeAll(async () => {
    const t = await createTestDb();
    pool = t.pool;
    db = t.db;
    reportRepo = new DrizzleStripeUsageReportRepository(db);
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await pool.close();
  });

  it("returns empty result when no local reports exist", async () => {
    const mockStripe = {
      billing: {
        meters: { listEventSummaries: vi.fn().mockResolvedValue({ data: [] }) },
      },
    } as unknown as import("stripe").default;

    const result = await runStripeUsageReconciliation({
      stripe: mockStripe,
      usageReportRepo: reportRepo,
      targetDate: new Date().toISOString().slice(0, 10),
      flagThresholdCents: 10,
    });

    expect(result.tenantsChecked).toBe(0);
    expect(result.discrepancies).toEqual([]);
  });

  it("detects drift when local valueCents differs from Stripe aggregated_value", async () => {
    await reportRepo.insert({
      id: crypto.randomUUID(),
      tenant: "t1",
      capability: "chat-completions",
      provider: "openrouter",
      periodStart: 1700000000000,
      periodEnd: 1700003600000,
      eventName: "chat_completions_usage",
      valueCents: 100,
      reportedAt: NOW,
    });

    // Stripe says it only received 80
    const mockStripe = {
      billing: {
        meters: {
          listEventSummaries: vi.fn().mockResolvedValue({
            data: [{ aggregated_value: 80 }],
          }),
        },
      },
    } as unknown as import("stripe").default;

    const targetDate = new Date(NOW).toISOString().slice(0, 10);
    // meterLookup returns "meterId:customerId"
    const result = await runStripeUsageReconciliation({
      stripe: mockStripe,
      usageReportRepo: reportRepo,
      meterLookup: vi.fn().mockResolvedValue({ meterId: "mtr_123", customerId: "cus_t1" }),
      targetDate,
      flagThresholdCents: 10,
    });

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].driftCents).toBe(20);
    expect(result.flagged).toContain("t1");
  });

  it("no discrepancy when values match", async () => {
    await reportRepo.insert({
      id: crypto.randomUUID(),
      tenant: "t1",
      capability: "chat-completions",
      provider: "openrouter",
      periodStart: 1700000000000,
      periodEnd: 1700003600000,
      eventName: "chat_completions_usage",
      valueCents: 100,
      reportedAt: NOW,
    });

    const mockStripe = {
      billing: {
        meters: {
          listEventSummaries: vi.fn().mockResolvedValue({
            data: [{ aggregated_value: 100 }],
          }),
        },
      },
    } as unknown as import("stripe").default;

    const targetDate = new Date(NOW).toISOString().slice(0, 10);
    const result = await runStripeUsageReconciliation({
      stripe: mockStripe,
      usageReportRepo: reportRepo,
      meterLookup: vi.fn().mockResolvedValue({ meterId: "mtr_123", customerId: "cus_t1" }),
      targetDate,
      flagThresholdCents: 10,
    });

    expect(result.discrepancies).toHaveLength(0);
    expect(result.flagged).toHaveLength(0);
  });
});
