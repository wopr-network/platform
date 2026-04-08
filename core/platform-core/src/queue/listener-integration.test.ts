/**
 * Integration tests for the LISTEN/NOTIFY wake-up path.
 *
 * These tests use the InMemoryNotificationSource test double instead of a
 * real pg.Pool — PGlite is single-connection and can't exercise cross-backend
 * NOTIFY delivery, so a fake is the right level of abstraction for unit tests.
 * The real pg.Pool path is exercised end-to-end in Phase 2 when the queue is
 * wired into boot and the real database is in play.
 *
 * What we verify here:
 *   - startListener / stopListener lifecycle
 *   - execute() wakes immediately on op_complete NOTIFY (no poll required)
 *   - QueueWorker wakes immediately on op_enqueued NOTIFY (no idle-poll wait)
 *   - Fallback to polling when the listener isn't attached (already covered in
 *     operation-queue.test.ts, this file focuses on the NOTIFY path)
 *   - Stopped listeners don't deliver stale events
 */

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { InMemoryNotificationSource } from "./notification-source.js";
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

// Slow sleep forces the test to rely on NOTIFY wake rather than poll fallback —
// if the wake path is broken, the test times out on the `await` for the slow
// sleep instead of spuriously resolving via poll.
const slowSleep = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60_000));

class TestWorker extends QueueWorker {}

describe("OperationQueue + NotificationSource integration", () => {
  let queue: OperationQueue;
  let source: InMemoryNotificationSource;

  beforeEach(async () => {
    await truncateAllTables(pool);
    source = new InMemoryNotificationSource();
    queue = new OperationQueue(db, {
      defaultPollIntervalMs: 60_000, // so polling does NOT drive resolution
      sleep: slowSleep,
    });
    await queue.startListener(source);
  });

  it("execute() resolves immediately when op_complete NOTIFY fires", async () => {
    const p = queue.execute<{ hello: string }>({
      type: "test.ping",
      payload: {},
      target: "core",
    });

    // Let execute() insert the row and park on the wake-or-poll race.
    await flushMicrotasks();

    // Drive the worker manually: claim + complete. The trigger would NORMALLY
    // fire the NOTIFY in production, but we're using the in-memory fake, so
    // we deliver manually. That's the point of the abstraction.
    const row = await queue.claim("core", "w-1");
    if (!row) throw new Error("expected claim to return row");
    await queue.complete(row.id, { hello: "world" });

    // Manually deliver the NOTIFY that the DB trigger would have fired.
    source.deliver("op_complete", row.id);

    await expect(p).resolves.toEqual({ hello: "world" });
  });

  it("execute() still resolves via polling when NOTIFY is missed", async () => {
    // Use a fast-sleep queue + no listener — proves the polling fallback still
    // works even when we're in the listener-aware code path.
    const pollOnlyQueue = new OperationQueue(db, {
      defaultPollIntervalMs: 0,
      sleep: () => new Promise((resolve) => setImmediate(resolve)),
    });

    const p = pollOnlyQueue.execute<{ ok: boolean }>({
      type: "test.ping",
      payload: {},
      target: "core",
    });
    await flushMicrotasks();
    const row = await pollOnlyQueue.claim("core", "w-1");
    if (!row) throw new Error("expected claim to return row");
    await pollOnlyQueue.complete(row.id, { ok: true });
    // Deliberately no deliver() call.
    await expect(p).resolves.toEqual({ ok: true });
  });

  it("stopListener() clears pending waiters so they resolve on the next poll tick", async () => {
    const pollableQueue = new OperationQueue(db, {
      defaultPollIntervalMs: 0,
      sleep: () => new Promise((resolve) => setImmediate(resolve)),
    });
    const fake = new InMemoryNotificationSource();
    await pollableQueue.startListener(fake);

    const p = pollableQueue.execute({
      type: "test.ping",
      payload: {},
      target: "core",
    });
    await flushMicrotasks();

    // Close the listener mid-flight. Pending waiters should unstick.
    await pollableQueue.stopListener();

    // Worker completes the row. Because we're poll-only now, execute() polls
    // the row status and resolves.
    const row = await pollableQueue.claim("core", "w-1");
    if (!row) throw new Error("expected claim to return row");
    await pollableQueue.complete(row.id, { done: true });

    await expect(p).resolves.toEqual({ done: true });
  });

  it("double-starting the listener throws", async () => {
    const extra = new InMemoryNotificationSource();
    await expect(queue.startListener(extra)).rejects.toThrow("listener already started");
  });

  it("subscribeEnqueued throws when listener not started", async () => {
    const lonely = new OperationQueue(db, { defaultPollIntervalMs: 60_000, sleep: slowSleep });
    await expect(lonely.subscribeEnqueued("core", () => {})).rejects.toThrow("requires startListener");
  });

  it("subscribeEnqueued delivers only matching target", async () => {
    const events: string[] = [];
    await queue.subscribeEnqueued("core", () => events.push("core-wake"));
    await queue.subscribeEnqueued("node-1", () => events.push("n1-wake"));

    source.deliver("op_enqueued", "core");
    source.deliver("op_enqueued", "node-1");
    source.deliver("op_enqueued", "node-2"); // no subscriber for this target

    await flushMicrotasks();
    expect(events).toEqual(["core-wake", "n1-wake"]);
  });
});

describe("QueueWorker + NotificationSource integration", () => {
  let queue: OperationQueue;
  let source: InMemoryNotificationSource;

  beforeEach(async () => {
    await truncateAllTables(pool);
    source = new InMemoryNotificationSource();
    queue = new OperationQueue(db, {
      // Both queue and worker polls are extremely slow; only NOTIFY can drive
      // progress in these tests.
      defaultPollIntervalMs: 60_000,
      sleep: slowSleep,
    });
    await queue.startListener(source);
  });

  it("worker drain loop wakes on op_enqueued NOTIFY", async () => {
    const handlers = new Map<string, OperationHandler>([["test.do", async (p) => ({ echoed: p })]]);
    const worker = new TestWorker(queue, "core", "w-1", handlers, {
      idlePollMs: 60_000, // so the idle poll never fires during the test
      sleep: slowSleep,
    });
    worker.start();

    // Let start() run through subscribeEnqueued and the loop hit its first
    // idleWait.
    await flushMicrotasks();
    await flushMicrotasks();

    // Enqueue via the queue. The execute() call will poll-wait (slowly), but
    // the worker should wake immediately via NOTIFY and claim the row.
    const resultPromise = queue.execute<{ echoed: unknown }>({
      type: "test.do",
      payload: { hi: 1 },
      target: "core",
      timeoutMs: 60_000,
    });

    // Let execute() insert the row. Then deliver both NOTIFYs that the
    // database trigger would fire.
    await flushMicrotasks();
    source.deliver("op_enqueued", "core"); // wake the worker's idleWait
    // Worker will pick up the row, run the handler, and call complete() —
    // at which point the trigger would fire op_complete in production. We
    // deliver it here.
    // We need to wait for the worker's handler to run first; flush a few
    // microtasks to let the chain complete.
    await flushTicks(10);

    // At this point the row should be succeeded. Deliver the completion
    // NOTIFY so execute() wakes up too.
    // (In production this is automatic via the trigger; here we fake it.)
    const all = await db.query.pendingOperations.findMany();
    for (const row of all) {
      if (row.status === "succeeded") source.deliver("op_complete", row.id);
    }

    await expect(resultPromise).resolves.toEqual({ echoed: { hi: 1 } });
    await worker.stop();
  });

  it("stop() returns quickly without waiting for idle poll", async () => {
    const worker = new TestWorker(queue, "core", "w-1", new Map(), {
      idlePollMs: 60_000,
      sleep: slowSleep,
    });
    worker.start();
    await flushMicrotasks();

    // stop() should wake the loop out of its 60s idle sleep and return fast.
    const start = Date.now();
    await worker.stop();
    const elapsed = Date.now() - start;
    // Give it some headroom but assert we're nowhere near 60s.
    expect(elapsed).toBeLessThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Yield to the event loop so pending microtasks drain. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function flushTicks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await flushMicrotasks();
}
