import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { DrizzleDeletionExecutorRepository } from "./deletion-executor-repository.js";
import type { InsertDeletionRequest } from "./deletion-repository.js";
import { DrizzleDeletionRepository } from "./deletion-repository.js";

function makeRow(overrides: Partial<InsertDeletionRequest> = {}): InsertDeletionRequest {
  return {
    id: overrides.id ?? "del-001",
    tenantId: overrides.tenantId ?? "tenant-1",
    requestedBy: overrides.requestedBy ?? "user-1",
    deleteAfter: overrides.deleteAfter ?? "2026-04-10T00:00:00.000Z",
    reason: overrides.reason,
    ...overrides,
  };
}

describe("DrizzleDeletionRepository", () => {
  let pool: PGlite;
  let db: PlatformDb;
  let repo: DrizzleDeletionRepository;
  let executorRepo: DrizzleDeletionExecutorRepository;

  beforeAll(async () => {
    ({ db, pool } = await createTestDb());
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    repo = new DrizzleDeletionRepository(db);
    executorRepo = new DrizzleDeletionExecutorRepository(db);
  });

  describe("insert + getById", () => {
    it("inserts a deletion request and reads it back", async () => {
      await repo.insert(makeRow({ reason: "Account no longer needed" }));
      const row = await repo.getById("del-001");
      expect(row).not.toBeNull();
      expect(row?.tenantId).toBe("tenant-1");
      expect(row?.requestedBy).toBe("user-1");
      expect(row?.status).toBe("pending");
      expect(row?.deleteAfter).toBe("2026-04-10T00:00:00.000Z");
      expect(row?.reason).toBe("Account no longer needed");
      expect(row?.cancelReason).toBeNull();
      expect(row?.completedAt).toBeNull();
      expect(row?.deletionSummary).toBeNull();
    });

    it("returns null for non-existent ID", async () => {
      expect(await repo.getById("no-such")).toBeNull();
    });
  });

  describe("listByTenant", () => {
    it("returns all requests for a tenant", async () => {
      await repo.insert(makeRow({ id: "d1", tenantId: "t1" }));
      await repo.insert(makeRow({ id: "d2", tenantId: "t1" }));
      await repo.insert(makeRow({ id: "d3", tenantId: "t2" }));

      const rows = await repo.listByTenant("t1");
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id).sort()).toEqual(["d1", "d2"]);
    });

    it("returns empty array for unknown tenant", async () => {
      expect(await repo.listByTenant("unknown")).toEqual([]);
    });
  });

  describe("cancel", () => {
    it("cancels a pending request", async () => {
      await repo.insert(makeRow({ id: "c1" }));
      const result = await repo.cancel("c1", "Changed my mind");
      expect(result).toBe(true);

      const row = await repo.getById("c1");
      expect(row?.status).toBe("cancelled");
      expect(row?.cancelReason).toBe("Changed my mind");
    });

    it("returns false for non-existent ID", async () => {
      expect(await repo.cancel("missing", "reason")).toBe(false);
    });

    it("returns false when request is already completed", async () => {
      await repo.insert(makeRow({ id: "c2" }));
      await executorRepo.markCompleted("c2", "{}");
      expect(await repo.cancel("c2", "Too late")).toBe(false);
    });

    it("returns false when request is already cancelled", async () => {
      await repo.insert(makeRow({ id: "c3" }));
      await repo.cancel("c3", "First cancel");
      expect(await repo.cancel("c3", "Second cancel")).toBe(false);
    });
  });
});
