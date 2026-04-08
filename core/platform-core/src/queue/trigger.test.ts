/**
 * Trigger verification — proves the 0043 migration's plpgsql trigger actually
 * fires on Drizzle INSERTs and UPDATEs against `pending_operations`.
 *
 * This is distinct from `listener-integration.test.ts`, which tests the
 * application's wake-up logic with a fake NotificationSource. Here we attach
 * a PGlite-level `listen` callback so we're validating the database side
 * end-to-end: the application issues a normal Drizzle mutation, the trigger
 * runs, pg_notify() fires, and the listener callback receives the payload.
 *
 * PGlite is single-connection, so LISTEN + NOTIFY round-trip within one
 * backend is the only real delivery mode available. Cross-backend delivery
 * is only exercised in production; but the trigger logic is identical in
 * both modes, so this is the right test level for the migration itself.
 */

import type { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { pendingOperations } from "../db/schema/pending-operations.js";
import { createTestDb, truncateAllTables } from "../test/db.js";

let pool: PGlite;
let db: PlatformDb;

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

/**
 * Capture NOTIFY payloads on a given channel for the duration of a test.
 * Returns the captured list and an unlisten function.
 */
async function capture(channel: string): Promise<{ payloads: string[]; unlisten: () => Promise<void> }> {
  const payloads: string[] = [];
  const unlisten = await pool.listen(channel, (payload) => {
    payloads.push(payload);
  });
  return { payloads, unlisten: async () => unlisten() };
}

/** Wait for the next microtask batch so async NOTIFY dispatch lands. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("pending_operations trigger", () => {
  beforeEach(async () => {
    await truncateAllTables(pool);
  });

  it("fires op_enqueued with target on INSERT", async () => {
    const { payloads, unlisten } = await capture("op_enqueued");
    try {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test.ping",
        payload: {} as never,
        target: "core",
      });
      await flush();
      expect(payloads).toEqual(["core"]);
    } finally {
      await unlisten();
    }
  });

  it("fires op_enqueued with empty string when target is NULL", async () => {
    const { payloads, unlisten } = await capture("op_enqueued");
    try {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test.ping",
        payload: {} as never,
        target: null,
      });
      await flush();
      expect(payloads).toEqual([""]);
    } finally {
      await unlisten();
    }
  });

  it("does NOT fire op_complete on pending→processing UPDATE", async () => {
    const { payloads, unlisten } = await capture("op_complete");
    try {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test.ping",
        payload: {} as never,
        target: "core",
      });
      await flush();
      payloads.length = 0; // clear any enqueue-side events

      // Transition pending → processing; should NOT trigger op_complete.
      await db
        .update(pendingOperations)
        .set({ status: "processing", claimedBy: "w-1", claimedAt: new Date().toISOString() })
        .where(eq(pendingOperations.id, "op-1"));
      await flush();
      expect(payloads).toEqual([]);
    } finally {
      await unlisten();
    }
  });

  it("fires op_complete with row id on processing→succeeded UPDATE", async () => {
    const { payloads, unlisten } = await capture("op_complete");
    try {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test.ping",
        payload: {} as never,
        target: "core",
      });
      await db
        .update(pendingOperations)
        .set({ status: "processing", claimedBy: "w-1", claimedAt: new Date().toISOString() })
        .where(eq(pendingOperations.id, "op-1"));
      await flush();
      payloads.length = 0;

      await db
        .update(pendingOperations)
        .set({ status: "succeeded", result: { ok: true } as never, completedAt: new Date().toISOString() })
        .where(eq(pendingOperations.id, "op-1"));
      await flush();
      expect(payloads).toEqual(["op-1"]);
    } finally {
      await unlisten();
    }
  });

  it("fires op_complete with row id on processing→failed UPDATE", async () => {
    const { payloads, unlisten } = await capture("op_complete");
    try {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test.bomb",
        payload: {} as never,
        target: "core",
      });
      await db
        .update(pendingOperations)
        .set({ status: "processing", claimedBy: "w-1", claimedAt: new Date().toISOString() })
        .where(eq(pendingOperations.id, "op-1"));
      await flush();
      payloads.length = 0;

      await db
        .update(pendingOperations)
        .set({ status: "failed", errorMessage: "kaboom", completedAt: new Date().toISOString() })
        .where(eq(pendingOperations.id, "op-1"));
      await flush();
      expect(payloads).toEqual(["op-1"]);
    } finally {
      await unlisten();
    }
  });

  it("does not fire op_complete on a non-terminal UPDATE", async () => {
    const { payloads, unlisten } = await capture("op_complete");
    try {
      await db.insert(pendingOperations).values({
        id: "op-1",
        type: "test.ping",
        payload: {} as never,
        target: "core",
      });
      // Janitor-style reset without ever passing through processing first.
      // The trigger should stay silent because OLD.status != 'processing'.
      await db.update(pendingOperations).set({ claimedBy: null }).where(eq(pendingOperations.id, "op-1"));
      await flush();
      expect(payloads).toEqual([]);
    } finally {
      await unlisten();
    }
  });
});
