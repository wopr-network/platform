import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../../db/index.js";
import { createTestDb, truncateAllTables } from "../../test/db.js";
import { DrizzleStripeUsageReportRepository } from "./usage-report-repository.js";

describe("DrizzleStripeUsageReportRepository", () => {
  let db: PlatformDb;
  let pool: import("@electric-sql/pglite").PGlite;
  let repo: DrizzleStripeUsageReportRepository;

  beforeAll(async () => {
    const t = await createTestDb();
    pool = t.pool;
    db = t.db;
    repo = new DrizzleStripeUsageReportRepository(db);
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
  });

  afterAll(async () => {
    await pool.close();
  });

  it("inserts a usage report row", async () => {
    const row = {
      id: crypto.randomUUID(),
      tenant: "t1",
      capability: "chat-completions",
      provider: "openrouter",
      periodStart: 1700000000000,
      periodEnd: 1700003600000,
      eventName: "chat_completions_usage",
      valueCents: 150,
      reportedAt: Date.now(),
    };
    await repo.insert(row);
    const found = await repo.getByTenantAndPeriod("t1", "chat-completions", "openrouter", 1700000000000);
    expect(found).toBeTruthy();
    expect(found?.valueCents).toBe(150);
  });

  it("returns null for non-existent report", async () => {
    const found = await repo.getByTenantAndPeriod("t1", "chat-completions", "openrouter", 1700000000000);
    expect(found).toBeNull();
  });

  it("rejects duplicate (tenant, capability, provider, periodStart)", async () => {
    const base = {
      tenant: "t1",
      capability: "chat-completions",
      provider: "openrouter",
      periodStart: 1700000000000,
      periodEnd: 1700003600000,
      eventName: "chat_completions_usage",
      valueCents: 100,
      reportedAt: Date.now(),
    };
    await repo.insert({ ...base, id: crypto.randomUUID() });
    await expect(repo.insert({ ...base, id: crypto.randomUUID() })).rejects.toThrow();
  });

  it("lists reports for a tenant in a date range", async () => {
    const base = {
      tenant: "t1",
      capability: "chat-completions",
      provider: "openrouter",
      eventName: "chat_completions_usage",
      valueCents: 50,
    };
    await repo.insert({ ...base, id: crypto.randomUUID(), periodStart: 100, periodEnd: 200, reportedAt: 300 });
    await repo.insert({ ...base, id: crypto.randomUUID(), periodStart: 200, periodEnd: 300, reportedAt: 400 });
    await repo.insert({
      ...base,
      id: crypto.randomUUID(),
      periodStart: 300,
      periodEnd: 400,
      reportedAt: 500,
      tenant: "t2",
    });

    const results = await repo.listByTenant("t1", { since: 0, until: 500 });
    expect(results).toHaveLength(2);
  });
});
