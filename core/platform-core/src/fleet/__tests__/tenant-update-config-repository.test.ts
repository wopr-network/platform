import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DrizzleDb } from "../../db/index.js";
import { beginTestTransaction, createTestDb, endTestTransaction, rollbackTestTransaction } from "../../test/db.js";
import { DrizzleTenantUpdateConfigRepository } from "../drizzle-tenant-update-config-repository.js";

describe("DrizzleTenantUpdateConfigRepository", () => {
  let db: DrizzleDb;
  let pool: PGlite;
  let repo: DrizzleTenantUpdateConfigRepository;

  beforeAll(async () => {
    ({ db, pool } = await createTestDb());
    await beginTestTransaction(pool);
  });

  afterAll(async () => {
    await endTestTransaction(pool);
    await pool.close();
  });

  beforeEach(async () => {
    await rollbackTestTransaction(pool);
    repo = new DrizzleTenantUpdateConfigRepository(db);
  });

  it("get returns null for unknown tenant", async () => {
    expect(await repo.get("nonexistent")).toBeNull();
  });

  it("upsert creates a new config", async () => {
    await repo.upsert("tenant-1", { mode: "auto", preferredHourUtc: 5 });
    const config = await repo.get("tenant-1");
    expect(config).not.toBeNull();
    expect(config?.tenantId).toBe("tenant-1");
    expect(config?.mode).toBe("auto");
    expect(config?.preferredHourUtc).toBe(5);
    expect(config?.updatedAt).toBeGreaterThan(0);
  });

  it("upsert updates an existing config", async () => {
    await repo.upsert("tenant-1", { mode: "auto", preferredHourUtc: 5 });
    const before = await repo.get("tenant-1");

    await repo.upsert("tenant-1", { mode: "manual", preferredHourUtc: 12 });
    const after = await repo.get("tenant-1");

    expect(after?.mode).toBe("manual");
    expect(after?.preferredHourUtc).toBe(12);
    expect(after?.updatedAt).toBeGreaterThanOrEqual(before?.updatedAt ?? 0);
  });

  it("listAutoEnabled returns only auto-mode tenants", async () => {
    await repo.upsert("tenant-auto-1", { mode: "auto", preferredHourUtc: 3 });
    await repo.upsert("tenant-auto-2", { mode: "auto", preferredHourUtc: 8 });
    await repo.upsert("tenant-manual", { mode: "manual", preferredHourUtc: 0 });

    const autoConfigs = await repo.listAutoEnabled();
    expect(autoConfigs).toHaveLength(2);
    expect(autoConfigs.every((c) => c.mode === "auto")).toBe(true);
    expect(autoConfigs.map((c) => c.tenantId).sort()).toEqual(["tenant-auto-1", "tenant-auto-2"]);
  });

  it("listAutoEnabled returns empty array when none enabled", async () => {
    await repo.upsert("tenant-manual", { mode: "manual", preferredHourUtc: 0 });
    const autoConfigs = await repo.listAutoEnabled();
    expect(autoConfigs).toEqual([]);
  });
});
