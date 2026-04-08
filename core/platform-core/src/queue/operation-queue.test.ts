import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { pendingOperations } from "../db/schema/pending-operations.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { OperationQueue } from "./operation-queue.js";

let pool: PGlite;
let db: PlatformDb;

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

// A fast sleep used throughout execute() polling tests. Yields to the event
// loop so queued async work (claim/complete) can run, then returns.
const fastSleep = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("OperationQueue", () => {
  let queue: OperationQueue;

  beforeEach(async () => {
    await truncateAllTables(pool);
    queue = new OperationQueue(db, {
      defaultPollIntervalMs: 0,
      sleep: fastSleep,
    });
  });

  // -------------------------------------------------------------------------
  // Schema / migration sanity
  // -------------------------------------------------------------------------

  describe("schema migration", () => {
    it("creates the pending_operations table with all columns", async () => {
      // If the migration is missing or wrong, the insert below throws.
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test.ping",
        payload: { foo: "bar" } as never,
        target: "core",
      });
      const rows = await db.select().from(pendingOperations);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "op-1",
        type: "test.ping",
        target: "core",
        status: "pending",
        claimedBy: null,
        claimedAt: null,
        result: null,
        errorMessage: null,
      });
      expect(rows[0].enqueuedAt).toBeTruthy(); // default now() applied
      expect(rows[0].timeoutS).toBe(300); // default applied
    });
  });

  // -------------------------------------------------------------------------
  // claim()
  // -------------------------------------------------------------------------

  describe("claim", () => {
    it("returns null when no work is available", async () => {
      const claimed = await queue.claim("core", "worker-a");
      expect(claimed).toBeNull();
    });

    it("claims a pending row and transitions it to processing", async () => {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test.ping",
        payload: {} as never,
        target: "core",
      });

      const claimed = await queue.claim("core", "worker-a");
      expect(claimed).not.toBeNull();
      expect(claimed?.id).toBe("op-1");
      expect(claimed?.status).toBe("processing");
      expect(claimed?.claimedBy).toBe("worker-a");
      expect(claimed?.claimedAt).not.toBeNull();

      // Post-claim state persisted in DB.
      const [stored] = await db.select().from(pendingOperations);
      expect(stored.status).toBe("processing");
      expect(stored.claimedBy).toBe("worker-a");
    });

    it("does not claim rows targeted at a different pool", async () => {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "bot.start",
        payload: {} as never,
        target: "node-1",
      });
      expect(await queue.claim("core", "worker-a")).toBeNull();
      expect(await queue.claim("node-2", "worker-b")).toBeNull();
      const claimed = await queue.claim("node-1", "worker-n1");
      expect(claimed?.id).toBe("op-1");
    });

    it("claims in FIFO order (oldest enqueuedAt first)", async () => {
      // Insert with explicit monotonic timestamps so ordering is deterministic.
      await db.insert(pendingOperations).values([
        { id: "op-old", type: "test", payload: {} as never, target: "core", enqueuedAt: "2020-01-01T00:00:00.000Z" },
        { id: "op-new", type: "test", payload: {} as never, target: "core", enqueuedAt: "2030-01-01T00:00:00.000Z" },
      ]);
      const first = await queue.claim("core", "worker-a");
      expect(first?.id).toBe("op-old");
      const second = await queue.claim("core", "worker-b");
      expect(second?.id).toBe("op-new");
      const third = await queue.claim("core", "worker-c");
      expect(third).toBeNull();
    });

    it("only claims rows in 'pending' status", async () => {
      await db.insert(pendingOperations).values({
        id: "op-done",
        type: "test",
        payload: {} as never,
        target: "core",
        status: "succeeded",
      });
      expect(await queue.claim("core", "worker-a")).toBeNull();
    });

    it("does not double-claim the same row (two sequential claims after completion)", async () => {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test",
        payload: {} as never,
        target: "core",
      });
      const first = await queue.claim("core", "worker-a");
      expect(first?.id).toBe("op-1");
      // A second claim attempt (different worker) while op-1 is still processing returns null.
      const second = await queue.claim("core", "worker-b");
      expect(second).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // complete / fail
  // -------------------------------------------------------------------------

  describe("complete / fail", () => {
    it("marks a processing row as succeeded with result", async () => {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test",
        payload: {} as never,
        target: "core",
      });
      await queue.claim("core", "worker-a");
      await queue.complete("op-1", { instanceId: "bot-42" });

      const [row] = await db.select().from(pendingOperations);
      expect(row.status).toBe("succeeded");
      expect(row.result).toEqual({ instanceId: "bot-42" });
      expect(row.errorMessage).toBeNull();
      expect(row.completedAt).not.toBeNull();
    });

    it("marks a processing row as failed with error message", async () => {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test",
        payload: {} as never,
        target: "core",
      });
      await queue.claim("core", "worker-a");
      await queue.fail("op-1", new Error("boom"));

      const [row] = await db.select().from(pendingOperations);
      expect(row.status).toBe("failed");
      expect(row.errorMessage).toBe("boom");
      expect(row.result).toBeNull();
      expect(row.completedAt).not.toBeNull();
    });

    it("refuses to complete a row that is not in processing", async () => {
      // Insert a pending row (never claimed)
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test",
        payload: {} as never,
        target: "core",
      });
      await queue.complete("op-1", { wat: true });
      const [row] = await db.select().from(pendingOperations);
      expect(row.status).toBe("pending");
      expect(row.result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // execute()
  // -------------------------------------------------------------------------

  describe("execute", () => {
    it("resolves with the worker's result when the row is completed", async () => {
      const p = queue.execute<{ ok: boolean }>({
        type: "test.ping",
        payload: { hi: 1 },
        target: "core",
      });
      // Let execute insert + first poll fire, then drive the worker.
      await fastSleep();
      const row = await queue.claim("core", "worker-a");
      if (!row) throw new Error("expected claim to return row");
      await queue.complete(row.id, { ok: true });
      await expect(p).resolves.toEqual({ ok: true });
    });

    it("rejects with the worker's error when the row fails", async () => {
      const p = queue.execute<unknown>({
        type: "test.fail",
        payload: {},
        target: "core",
      });
      await fastSleep();
      const row = await queue.claim("core", "worker-a");
      if (!row) throw new Error("expected claim to return row");
      await queue.fail(row.id, new Error("handler exploded"));
      await expect(p).rejects.toThrow("handler exploded");
    });

    it("times out when no worker completes the row", async () => {
      const clock = new FakeClock(1_000_000);
      const fastQueue = new OperationQueue(db, {
        defaultPollIntervalMs: 0,
        now: () => clock.now(),
        sleep: async () => {
          clock.advance(200);
        },
      });
      await expect(
        fastQueue.execute({
          type: "test.slow",
          payload: {},
          target: "core",
          timeoutMs: 500,
        }),
      ).rejects.toThrow(/timed out after 500ms/);
    });

    it("short-circuits on idempotency key when the row is already succeeded", async () => {
      // Pre-seed a succeeded row with a known idempotency key.
      await db.insert(pendingOperations).values({
        id: "op-seed",
        type: "test.ping",
        payload: { original: true } as never,
        target: "core",
        status: "succeeded",
        result: { fromCache: true } as never,
        idempotencyKey: "idem-1",
        completedAt: new Date().toISOString(),
      });

      // Caller re-executes with the same key; should resolve to the existing result
      // without enqueueing a new row or needing a worker to run.
      const result = await queue.execute<{ fromCache: boolean }>({
        type: "test.ping",
        payload: { original: false },
        target: "core",
        idempotencyKey: "idem-1",
      });
      expect(result).toEqual({ fromCache: true });

      // No new row was inserted.
      const rows = await db.select().from(pendingOperations);
      expect(rows).toHaveLength(1);
    });

    it("joins an in-flight row with the same idempotency key", async () => {
      const first = queue.execute<{ n: number }>({
        type: "test.ping",
        payload: {},
        target: "core",
        idempotencyKey: "idem-2",
      });
      await fastSleep();

      // Second caller with the same key must NOT enqueue a new row.
      const second = queue.execute<{ n: number }>({
        type: "test.ping",
        payload: {},
        target: "core",
        idempotencyKey: "idem-2",
      });
      await fastSleep();

      const allRows = await db.select().from(pendingOperations);
      expect(allRows).toHaveLength(1);

      // Drive the worker; both Promises resolve to the same result.
      const row = await queue.claim("core", "worker-a");
      if (!row) throw new Error("expected claim to return row");
      await queue.complete(row.id, { n: 7 });

      await expect(first).resolves.toEqual({ n: 7 });
      await expect(second).resolves.toEqual({ n: 7 });
    });
  });

  // -------------------------------------------------------------------------
  // janitorSweep()
  // -------------------------------------------------------------------------

  describe("janitorSweep", () => {
    it("resets processing rows past their deadline to pending", async () => {
      const stuckClaimedAt = new Date(0).toISOString(); // 1970 — definitely stale
      await db.insert(pendingOperations).values({
        id: "op-stuck",
        type: "test",
        payload: {} as never,
        target: "core",
        status: "processing",
        claimedBy: "worker-dead",
        claimedAt: stuckClaimedAt,
        timeoutS: 60,
      });
      const result = await queue.janitorSweep(Date.now());
      expect(result.reset).toBe(1);
      const [row] = await db.select().from(pendingOperations);
      expect(row.status).toBe("pending");
      expect(row.claimedBy).toBeNull();
      expect(row.claimedAt).toBeNull();
    });

    it("leaves fresh processing rows alone", async () => {
      const recent = new Date().toISOString();
      await db.insert(pendingOperations).values({
        id: "op-fresh",
        type: "test",
        payload: {} as never,
        target: "core",
        status: "processing",
        claimedBy: "worker-alive",
        claimedAt: recent,
        timeoutS: 300,
      });
      const result = await queue.janitorSweep(Date.now());
      expect(result.reset).toBe(0);
      const [row] = await db.select().from(pendingOperations);
      expect(row.status).toBe("processing");
      expect(row.claimedBy).toBe("worker-alive");
    });

    it("leaves terminal rows alone", async () => {
      await db.insert(pendingOperations).values([
        {
          id: "op-done",
          type: "test",
          payload: {} as never,
          target: "core",
          status: "succeeded",
          result: { ok: 1 } as never,
        },
        {
          id: "op-err",
          type: "test",
          payload: {} as never,
          target: "core",
          status: "failed",
          errorMessage: "nope",
        },
      ]);
      const result = await queue.janitorSweep(Date.now());
      expect(result.reset).toBe(0);
    });

    it("reclaimed rows can be picked up by the next worker", async () => {
      await db.insert(pendingOperations).values({
        id: "op-stuck",
        type: "test",
        payload: {} as never,
        target: "core",
        status: "processing",
        claimedBy: "worker-dead",
        claimedAt: new Date(0).toISOString(),
        timeoutS: 60,
      });
      await queue.janitorSweep(Date.now());
      const reclaimed = await queue.claim("core", "worker-alive");
      expect(reclaimed?.id).toBe("op-stuck");
      expect(reclaimed?.claimedBy).toBe("worker-alive");
    });
  });

  // -------------------------------------------------------------------------
  // enqueue() — fire-and-forget
  // -------------------------------------------------------------------------

  describe("enqueue", () => {
    it("inserts a pending row and returns its id without awaiting completion", async () => {
      const { id } = await queue.enqueue({
        type: "test.ping",
        payload: { hello: "world" },
        target: "core",
      });
      expect(id).toMatch(/.+/);
      const [row] = await db.select().from(pendingOperations);
      expect(row).toMatchObject({
        id,
        type: "test.ping",
        target: "core",
        status: "pending",
      });
    });

    it("collapses duplicate idempotency keys to a single row", async () => {
      const first = await queue.enqueue({
        type: "core.janitor.sweep",
        payload: {},
        target: "core",
        idempotencyKey: "core.janitor.sweep:42",
      });
      const second = await queue.enqueue({
        type: "core.janitor.sweep",
        payload: {},
        target: "core",
        idempotencyKey: "core.janitor.sweep:42",
      });
      expect(second.id).toBe(first.id);
      const rows = await db.select().from(pendingOperations);
      expect(rows).toHaveLength(1);
    });

    it("different idempotency keys produce different rows", async () => {
      const a = await queue.enqueue({
        type: "core.janitor.sweep",
        payload: {},
        target: "core",
        idempotencyKey: "core.janitor.sweep:42",
      });
      const b = await queue.enqueue({
        type: "core.janitor.sweep",
        payload: {},
        target: "core",
        idempotencyKey: "core.janitor.sweep:43",
      });
      expect(b.id).not.toBe(a.id);
      const rows = await db.select().from(pendingOperations);
      expect(rows).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // purge() — retention sweep
  // -------------------------------------------------------------------------

  describe("purge", () => {
    it("deletes succeeded rows whose completed_at is older than the cutoff", async () => {
      const old = new Date(1_000_000).toISOString();
      const fresh = new Date(Date.now()).toISOString();
      await db.insert(pendingOperations).values([
        {
          id: "op-old",
          type: "test",
          payload: {} as never,
          target: "core",
          status: "succeeded",
          completedAt: old,
        },
        {
          id: "op-fresh",
          type: "test",
          payload: {} as never,
          target: "core",
          status: "succeeded",
          completedAt: fresh,
        },
      ]);
      const result = await queue.purge(60_000);
      expect(result.deleted).toBe(1);
      const rows = await db.select().from(pendingOperations);
      expect(rows.map((r) => r.id)).toEqual(["op-fresh"]);
    });

    it("deletes failed rows past the cutoff", async () => {
      const old = new Date(1_000_000).toISOString();
      await db.insert(pendingOperations).values({
        id: "op-err-old",
        type: "test",
        payload: {} as never,
        target: "core",
        status: "failed",
        errorMessage: "boom",
        completedAt: old,
      });
      const result = await queue.purge(60_000);
      expect(result.deleted).toBe(1);
    });

    it("leaves pending and processing rows alone regardless of age", async () => {
      const ancient = new Date(1).toISOString();
      await db.insert(pendingOperations).values([
        {
          id: "op-pending",
          type: "test",
          payload: {} as never,
          target: "core",
          status: "pending",
          enqueuedAt: ancient,
        },
        {
          id: "op-processing",
          type: "test",
          payload: {} as never,
          target: "core",
          status: "processing",
          claimedBy: "w",
          claimedAt: ancient,
          enqueuedAt: ancient,
        },
      ]);
      const result = await queue.purge(0);
      expect(result.deleted).toBe(0);
      const rows = await db.select().from(pendingOperations);
      expect(rows).toHaveLength(2);
    });

    it("leaves terminal rows with null completed_at alone", async () => {
      // Defensive: we should never insert a terminal row without completed_at
      // in production code, but the delete guard should still skip them so
      // the lt(null, x) comparison doesn't swallow untimestamped rows.
      await db.insert(pendingOperations).values({
        id: "op-weird",
        type: "test",
        payload: {} as never,
        target: "core",
        status: "succeeded",
      });
      const result = await queue.purge(0);
      expect(result.deleted).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

class FakeClock {
  constructor(private t: number) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
