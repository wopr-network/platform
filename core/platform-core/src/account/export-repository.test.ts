import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import type { InsertExportRequest } from "./export-repository.js";
import { DrizzleExportRepository } from "./export-repository.js";

function makeRow(overrides: Partial<InsertExportRequest> = {}): InsertExportRequest {
  return {
    id: overrides.id ?? "exp-001",
    tenantId: overrides.tenantId ?? "tenant-1",
    requestedBy: overrides.requestedBy ?? "user-1",
    format: overrides.format,
    ...overrides,
  };
}

describe("DrizzleExportRepository", () => {
  let pool: PGlite;
  let db: PlatformDb;
  let repo: DrizzleExportRepository;

  beforeAll(async () => {
    ({ db, pool } = await createTestDb());
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    repo = new DrizzleExportRepository(db);
  });

  describe("insert + getById", () => {
    it("inserts an export request and reads it back", async () => {
      await repo.insert(makeRow());
      const row = await repo.getById("exp-001");
      expect(row).not.toBeNull();
      expect(row?.tenantId).toBe("tenant-1");
      expect(row?.requestedBy).toBe("user-1");
      expect(row?.status).toBe("pending");
      expect(row?.format).toBe("json");
      expect(row?.downloadUrl).toBeNull();
    });

    it("respects custom format", async () => {
      await repo.insert(makeRow({ id: "exp-csv", format: "csv" }));
      const row = await repo.getById("exp-csv");
      expect(row?.format).toBe("csv");
    });

    it("returns null for non-existent ID", async () => {
      expect(await repo.getById("no-such")).toBeNull();
    });
  });

  describe("listByTenant", () => {
    it("returns all export requests for a tenant", async () => {
      await repo.insert(makeRow({ id: "e1", tenantId: "t1" }));
      await repo.insert(makeRow({ id: "e2", tenantId: "t1" }));
      await repo.insert(makeRow({ id: "e3", tenantId: "t2" }));

      const rows = await repo.listByTenant("t1");
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id).sort()).toEqual(["e1", "e2"]);
    });

    it("returns empty array for unknown tenant", async () => {
      expect(await repo.listByTenant("unknown")).toEqual([]);
    });
  });

  describe("markProcessing", () => {
    it("transitions pending to processing", async () => {
      await repo.insert(makeRow({ id: "mp-1" }));
      expect(await repo.markProcessing("mp-1")).toBe(true);

      const row = await repo.getById("mp-1");
      expect(row?.status).toBe("processing");
    });

    it("returns false for non-existent ID", async () => {
      expect(await repo.markProcessing("missing")).toBe(false);
    });

    it("returns false when not in pending state", async () => {
      await repo.insert(makeRow({ id: "mp-2" }));
      await repo.markProcessing("mp-2");
      expect(await repo.markProcessing("mp-2")).toBe(false);
    });
  });

  describe("markCompleted", () => {
    it("transitions processing to completed with download URL", async () => {
      await repo.insert(makeRow({ id: "mc-1" }));
      await repo.markProcessing("mc-1");
      expect(await repo.markCompleted("mc-1", "https://storage.example.com/export-mc-1.zip")).toBe(true);

      const row = await repo.getById("mc-1");
      expect(row?.status).toBe("completed");
      expect(row?.downloadUrl).toBe("https://storage.example.com/export-mc-1.zip");
    });

    it("returns false when not in processing state", async () => {
      await repo.insert(makeRow({ id: "mc-2" }));
      expect(await repo.markCompleted("mc-2", "https://example.com")).toBe(false);
    });

    it("returns false for non-existent ID", async () => {
      expect(await repo.markCompleted("missing", "https://example.com")).toBe(false);
    });
  });

  describe("markFailed", () => {
    it("transitions processing to failed", async () => {
      await repo.insert(makeRow({ id: "mf-1" }));
      await repo.markProcessing("mf-1");
      expect(await repo.markFailed("mf-1")).toBe(true);

      const row = await repo.getById("mf-1");
      expect(row?.status).toBe("failed");
    });

    it("returns false when not in processing state", async () => {
      await repo.insert(makeRow({ id: "mf-2" }));
      expect(await repo.markFailed("mf-2")).toBe(false);
    });

    it("returns false for non-existent ID", async () => {
      expect(await repo.markFailed("missing")).toBe(false);
    });
  });
});
