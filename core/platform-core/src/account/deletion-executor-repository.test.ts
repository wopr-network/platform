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
    deleteAfter: overrides.deleteAfter ?? "2026-03-01T00:00:00.000Z",
    reason: overrides.reason,
    ...overrides,
  };
}

describe("DrizzleDeletionExecutorRepository", () => {
  let pool: PGlite;
  let db: PlatformDb;
  let repo: DrizzleDeletionExecutorRepository;
  let insertRepo: DrizzleDeletionRepository;

  beforeAll(async () => {
    ({ db, pool } = await createTestDb());
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    repo = new DrizzleDeletionExecutorRepository(db);
    insertRepo = new DrizzleDeletionRepository(db);
  });

  describe("findRipe", () => {
    it("returns pending requests whose deleteAfter is <= now", async () => {
      await insertRepo.insert(makeRow({ id: "ripe-1", deleteAfter: "2026-03-01T00:00:00.000Z" }));
      await insertRepo.insert(makeRow({ id: "ripe-2", deleteAfter: "2026-03-05T00:00:00.000Z" }));
      await insertRepo.insert(makeRow({ id: "future", deleteAfter: "2026-04-01T00:00:00.000Z" }));

      const ripe = await repo.findRipe("2026-03-10T00:00:00.000Z");
      expect(ripe).toHaveLength(2);
      expect(ripe.map((r) => r.id).sort()).toEqual(["ripe-1", "ripe-2"]);
    });

    it("excludes completed and cancelled requests", async () => {
      await insertRepo.insert(makeRow({ id: "d1", deleteAfter: "2026-03-01T00:00:00.000Z" }));
      await insertRepo.insert(makeRow({ id: "d2", deleteAfter: "2026-03-01T00:00:00.000Z" }));
      await insertRepo.cancel("d2", "cancelled");
      await repo.markCompleted("d1", '{"users":1}');

      const ripe = await repo.findRipe("2026-03-10T00:00:00.000Z");
      expect(ripe).toHaveLength(0);
    });

    it("returns empty array when no ripe requests exist", async () => {
      await insertRepo.insert(makeRow({ id: "f1", deleteAfter: "2026-12-01T00:00:00.000Z" }));
      expect(await repo.findRipe("2026-03-10T00:00:00.000Z")).toEqual([]);
    });
  });

  describe("markCompleted", () => {
    it("marks a pending request as completed with summary", async () => {
      await insertRepo.insert(makeRow({ id: "mc-1" }));
      const result = await repo.markCompleted("mc-1", '{"users":5,"sessions":12}');
      expect(result).toBe(true);

      const row = await insertRepo.getById("mc-1");
      expect(row?.status).toBe("completed");
      expect(row?.deletionSummary).toBe('{"users":5,"sessions":12}');
      expect(row?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/);
    });

    it("returns false for non-existent ID", async () => {
      expect(await repo.markCompleted("missing", "{}")).toBe(false);
    });

    it("returns false for already-completed request", async () => {
      await insertRepo.insert(makeRow({ id: "mc-2" }));
      await repo.markCompleted("mc-2", "{}");
      expect(await repo.markCompleted("mc-2", "{}")).toBe(false);
    });
  });

  describe("findPendingByTenant", () => {
    it("returns the pending request for a tenant", async () => {
      await insertRepo.insert(makeRow({ id: "p1", tenantId: "t1" }));
      const row = await repo.findPendingByTenant("t1");
      expect(row).not.toBeNull();
      expect(row?.id).toBe("p1");
      expect(row?.status).toBe("pending");
    });

    it("returns null when no pending request exists", async () => {
      expect(await repo.findPendingByTenant("unknown")).toBeNull();
    });

    it("returns null when tenant only has completed/cancelled requests", async () => {
      await insertRepo.insert(makeRow({ id: "p2", tenantId: "t2" }));
      await insertRepo.cancel("p2", "cancelled");
      expect(await repo.findPendingByTenant("t2")).toBeNull();
    });
  });
});
