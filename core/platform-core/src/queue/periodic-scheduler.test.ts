import { describe, expect, it, vi } from "vitest";
import type { IOperationQueue, OperationRequest } from "./operation-queue.js";
import { bucketKey, PeriodicScheduler } from "./periodic-scheduler.js";

/**
 * Build a minimal stub IOperationQueue that records every `enqueue()` call
 * so tests can assert on type/idempotency key/payload without pulling in a
 * real database. All other methods throw — the scheduler should only ever
 * call `enqueue()`.
 */
function stubQueue(): { queue: IOperationQueue; calls: OperationRequest[] } {
  const calls: OperationRequest[] = [];
  const queue: IOperationQueue = {
    execute: async () => {
      throw new Error("stub: execute should not be called");
    },
    enqueue: async (req) => {
      calls.push(req);
      return { id: `id-${calls.length}` };
    },
    claim: async () => null,
    complete: async () => {},
    fail: async () => {},
    janitorSweep: async () => ({ reset: 0 }),
    purge: async () => ({ deleted: 0 }),
    startListener: async () => {},
    stopListener: async () => {},
    subscribeEnqueued: async () => {},
  };
  return { queue, calls };
}

describe("bucketKey", () => {
  it("formats daily buckets as UTC date", () => {
    // 2026-04-08T12:00:00Z — bucket should be the date slice.
    const ts = Date.UTC(2026, 3, 8, 12, 0, 0);
    const key = bucketKey({ type: "core.queue.purge", bucketSize: "day" }, ts);
    expect(key).toBe("core.queue.purge:2026-04-08");
  });

  it("formats numeric buckets as floor(now/size)", () => {
    // 30s bucket at 61_000ms is bucket 2 (floor(61000/30000)).
    const key = bucketKey({ type: "core.janitor.sweep", bucketSize: 30_000 }, 61_000);
    expect(key).toBe("core.janitor.sweep:2");
  });

  it("returns the same key across the whole bucket window", () => {
    // Both 0ms and 29_999ms fall in bucket 0 of a 30s window.
    const task = { type: "x", bucketSize: 30_000 };
    expect(bucketKey(task, 0)).toBe(bucketKey(task, 29_999));
  });
});

describe("PeriodicScheduler", () => {
  it("enqueues one row per task per tick with bucketed idempotency keys", async () => {
    const { queue, calls } = stubQueue();
    const now = Date.UTC(2026, 3, 8, 0, 0, 0);
    const scheduler = new PeriodicScheduler(
      queue,
      [
        { type: "core.janitor.sweep", bucketSize: 30_000 },
        { type: "core.queue.purge", bucketSize: "day" },
      ],
      { now: () => now, fireOnStart: false },
    );

    await scheduler.tick();

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      type: "core.janitor.sweep",
      target: "core",
      idempotencyKey: expect.stringMatching(/^core\.janitor\.sweep:/) as unknown as string,
    });
    expect(calls[1]).toMatchObject({
      type: "core.queue.purge",
      target: "core",
      idempotencyKey: "core.queue.purge:2026-04-08",
    });
  });

  it("uses the same key inside the same bucket, a new key after crossing a boundary", async () => {
    const { queue, calls } = stubQueue();
    let now = 0;
    const scheduler = new PeriodicScheduler(queue, [{ type: "t", bucketSize: 30_000 }], {
      now: () => now,
      fireOnStart: false,
    });

    await scheduler.tick();
    now = 15_000; // still bucket 0
    await scheduler.tick();
    now = 30_000; // bucket 1
    await scheduler.tick();

    expect(calls).toHaveLength(3);
    expect(calls[0].idempotencyKey).toBe(calls[1].idempotencyKey);
    expect(calls[0].idempotencyKey).not.toBe(calls[2].idempotencyKey);
  });

  it("swallows enqueue errors so one bad task doesn't stop the others", async () => {
    const calls: OperationRequest[] = [];
    const queue: IOperationQueue = {
      execute: async () => {
        throw new Error("not used");
      },
      enqueue: vi.fn(async (req: OperationRequest) => {
        calls.push(req);
        if (req.type === "bad") throw new Error("db went away");
        return { id: req.type };
      }),
      claim: async () => null,
      complete: async () => {},
      fail: async () => {},
      janitorSweep: async () => ({ reset: 0 }),
      purge: async () => ({ deleted: 0 }),
      startListener: async () => {},
      stopListener: async () => {},
      subscribeEnqueued: async () => {},
    };
    const scheduler = new PeriodicScheduler(
      queue,
      [
        { type: "bad", bucketSize: 30_000 },
        { type: "good", bucketSize: 30_000 },
      ],
      { now: () => 0, fireOnStart: false },
    );

    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(calls.map((c) => c.type).sort()).toEqual(["bad", "good"]);
  });

  it("start() is idempotent", () => {
    const { queue } = stubQueue();
    const scheduler = new PeriodicScheduler(queue, [{ type: "t", bucketSize: 30_000 }], {
      fireOnStart: false,
    });
    try {
      scheduler.start();
      scheduler.start(); // no-op
    } finally {
      scheduler.stop();
    }
  });

  it("stop() is idempotent and safe before start", () => {
    const { queue } = stubQueue();
    const scheduler = new PeriodicScheduler(queue, []);
    scheduler.stop(); // before start
    scheduler.stop(); // again
  });
});
