import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { pendingOperations } from "../db/schema/pending-operations.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { OperationQueue } from "./operation-queue.js";
import { type OperationHandler, QueueWorker } from "./queue-worker.js";

let pool: PGlite;
let db: PlatformDb;

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

// Concrete subclass so we can instantiate the abstract QueueWorker in tests.
class TestWorker extends QueueWorker {}

const fastSleep = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("QueueWorker", () => {
  let queue: OperationQueue;

  beforeEach(async () => {
    await truncateAllTables(pool);
    queue = new OperationQueue(db, {
      defaultPollIntervalMs: 0,
      sleep: fastSleep,
    });
  });

  it("tickOnce returns false when the queue is empty", async () => {
    const worker = new TestWorker(queue, "core", "w-1", new Map());
    expect(await worker.tickOnce()).toBe(false);
  });

  it("runs the registered handler for a claimed row and completes it", async () => {
    const calls: unknown[] = [];
    const handlers = new Map<string, OperationHandler>([
      [
        "test.echo",
        async (payload) => {
          calls.push(payload);
          return { echoed: payload };
        },
      ],
    ]);
    const worker = new TestWorker(queue, "core", "w-1", handlers);

    // Enqueue via execute so the promise picks up the result.
    const resultPromise = queue.execute<{ echoed: unknown }>({
      type: "test.echo",
      payload: { hi: 42 },
      target: "core",
    });

    // Drive the worker synchronously from the test.
    await fastSleep();
    const ran = await worker.tickOnce();
    expect(ran).toBe(true);

    await expect(resultPromise).resolves.toEqual({ echoed: { hi: 42 } });
    expect(calls).toEqual([{ hi: 42 }]);
  });

  it("marks the row failed when the handler throws", async () => {
    const handlers = new Map<string, OperationHandler>([
      [
        "test.bomb",
        async () => {
          throw new Error("kaboom");
        },
      ],
    ]);
    const worker = new TestWorker(queue, "core", "w-1", handlers);

    const resultPromise = queue.execute({
      type: "test.bomb",
      payload: {},
      target: "core",
    });

    await fastSleep();
    await worker.tickOnce();
    await expect(resultPromise).rejects.toThrow("kaboom");
  });

  it("marks the row failed when no handler is registered", async () => {
    const worker = new TestWorker(queue, "core", "w-1", new Map());
    const resultPromise = queue.execute({
      type: "test.unknown",
      payload: {},
      target: "core",
    });
    await fastSleep();
    const ran = await worker.tickOnce();
    expect(ran).toBe(true);
    await expect(resultPromise).rejects.toThrow(/No handler registered for operation type 'test.unknown'/);
  });

  it("only claims rows for its configured target", async () => {
    const coreHandlers = new Map<string, OperationHandler>([["bot.start", async () => ({ ok: "core" })]]);
    const nodeHandlers = new Map<string, OperationHandler>([["bot.start", async () => ({ ok: "node" })]]);
    const coreWorker = new TestWorker(queue, "core", "w-core", coreHandlers);
    const nodeWorker = new TestWorker(queue, "node-1", "w-n1", nodeHandlers);

    await db.insert(pendingOperations).values([
      { id: "core-op", type: "bot.start", payload: {} as never, target: "core" },
      { id: "node-op", type: "bot.start", payload: {} as never, target: "node-1" },
    ]);

    // Core worker should only claim the core-targeted row.
    expect(await coreWorker.tickOnce()).toBe(true);
    expect(await coreWorker.tickOnce()).toBe(false); // no more core work

    // Node worker should only claim the node-targeted row.
    expect(await nodeWorker.tickOnce()).toBe(true);
    expect(await nodeWorker.tickOnce()).toBe(false);

    const rows = await db.select().from(pendingOperations);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("core-op")?.status).toBe("succeeded");
    expect(byId.get("core-op")?.result).toEqual({ ok: "core" });
    expect(byId.get("node-op")?.status).toBe("succeeded");
    expect(byId.get("node-op")?.result).toEqual({ ok: "node" });
  });

  it("start()/stop() drain the queue in the background", async () => {
    const handlers = new Map<string, OperationHandler>([["test.ping", async (p) => ({ pong: p })]]);
    const worker = new TestWorker(queue, "core", "w-1", handlers);

    const p = queue.execute({ type: "test.ping", payload: { n: 1 }, target: "core" });
    worker.start();
    await expect(p).resolves.toEqual({ pong: { n: 1 } });
    await worker.stop();
  });

  it("stop() exits cleanly when the loop is idle", async () => {
    const worker = new TestWorker(queue, "core", "w-1", new Map());
    worker.start();
    await worker.stop();
    // Starting + stopping a second time is a no-op.
    worker.start();
    await worker.stop();
  });
});
