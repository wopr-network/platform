/**
 * End-to-end integration test for the `instance.create` queue handler.
 *
 * Wires a real `OperationQueue`, a real `QueueWorker`, and a real
 * `InstanceService` (with stubbed deps) and asserts that calling
 * `instanceService.create(params)` returns the same `CreatedInstance` the
 * saga produces — proving the round-trip through the queue is transparent
 * to the caller.
 *
 * The fakes here are deliberately minimal: just enough surface to keep
 * `runCreate()` happy. The point is not to test the saga; the point is to
 * prove the queue-as-transport doesn't break it.
 */

import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Credit } from "../credits/credit.js";
import type { ILedger } from "../credits/ledger.js";
import type { PlatformDb } from "../db/index.js";
import type { CreateInstanceParams, InstanceServiceDeps } from "../fleet/instance-service.js";
import { InstanceService } from "../fleet/instance-service.js";
import type { ProductConfig } from "../product-config/repository-types.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { OperationQueue } from "./operation-queue.js";
import { QueueWorker } from "./queue-worker.js";

let pool: PGlite;
let db: PlatformDb;

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function makeStubLedger(centsBalance: number): ILedger {
  return { balance: async () => Credit.fromCents(centsBalance) } as never as ILedger;
}

/**
 * A stub fleet that returns a canned "instance" object on create. The shape
 * matches what `runCreate` reads off the result: id, nodeId, url, containerName.
 */
function makeStubFleet() {
  return {
    create: async () => ({
      id: "inst-created",
      nodeId: "node-test",
      url: "http://test-created/",
      containerName: "test-created",
      containerId: "container-1",
      profile: { id: "inst-created", name: "stub", tenantId: "t-1" },
    }),
    remove: async () => {},
    getInstance: async () => ({
      id: "inst-created",
      nodeId: "node-test",
      url: "http://test-created/",
      containerName: "test-created",
      containerId: "container-1",
      profile: { id: "inst-created", name: "stub", tenantId: "t-1" },
    }),
  } as never;
}

const stubBotInstanceRepo = {
  create: async () => {},
  setBillingState: async () => {},
} as never;

const stubProfileStore = {
  list: async () => [],
} as never;

function makeProductConfig(): ProductConfig {
  return {
    product: { id: "p", slug: "test", name: "Test", domain: "test.local" } as never,
    navItems: [],
    domains: [],
    features: null,
    fleet: { containerImage: "test:latest", containerPort: 3000 } as never,
    billing: null,
  };
}

function makeParams(name = "test-bot"): CreateInstanceParams {
  return {
    tenantId: "t-1",
    userId: "u-1",
    userEmail: "u@test.local",
    name,
    productSlug: "test",
    productConfig: makeProductConfig(),
  };
}

const fastSleep = (): Promise<void> => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("instance.create end-to-end through OperationQueue", () => {
  let queue: OperationQueue;
  let worker: QueueWorker;
  let svc: InstanceService;

  beforeEach(async () => {
    await truncateAllTables(pool);
    queue = new OperationQueue(db, {
      defaultPollIntervalMs: 0,
      sleep: fastSleep,
    });
    const deps: InstanceServiceDeps = {
      creditLedger: makeStubLedger(1000),
      profileStore: stubProfileStore,
      botInstanceRepo: stubBotInstanceRepo,
      serviceKeyRepo: null,
      provisionSecret: null,
      fleet: makeStubFleet(),
      operationQueue: queue,
    };
    svc = new InstanceService(deps);
    worker = new QueueWorker(queue, "core", "w-test", new Map());
    worker.registerHandler("instance.create", async (payload) => svc.handleCreateOperation(payload));
  });

  it("dispatches create() through the queue and returns the saga result", async () => {
    const promise = svc.create(makeParams("test-bot"));

    // Drive the worker manually so the test is deterministic.
    await fastSleep();
    const ran = await worker.tickOnce();
    expect(ran).toBe(true);

    const result = await promise;
    expect(result).toMatchObject({
      id: "inst-created",
      name: "test-bot",
      tenantId: "t-1",
      nodeId: "node-test",
      containerUrl: "http://test-created/",
    });

    // The pending_operations row should now be terminal.
    const rows = await db.query.pendingOperations.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("succeeded");
    expect(rows[0].type).toBe("instance.create");
  });

  it("propagates handler errors back through the Promise", async () => {
    // Force the saga to fail at the credit-check step.
    const failingDeps: InstanceServiceDeps = {
      creditLedger: makeStubLedger(0),
      profileStore: stubProfileStore,
      botInstanceRepo: stubBotInstanceRepo,
      serviceKeyRepo: null,
      provisionSecret: null,
      fleet: makeStubFleet(),
      operationQueue: queue,
    };
    const failingSvc = new InstanceService(failingDeps);
    const failingWorker = new QueueWorker(queue, "core", "w-test", new Map());
    failingWorker.registerHandler("instance.create", async (payload) => failingSvc.handleCreateOperation(payload));

    const promise = failingSvc.create(makeParams("broke-bot"));
    await fastSleep();
    await failingWorker.tickOnce();
    await expect(promise).rejects.toThrow(/Insufficient credits/);

    // Row should be terminal=failed.
    const rows = await db.query.pendingOperations.findMany();
    expect(rows[0].status).toBe("failed");
    expect(rows[0].errorMessage).toMatch(/Insufficient credits/);
  });

  it("falls back to inline saga when no operationQueue is wired", async () => {
    const inlineDeps: InstanceServiceDeps = {
      creditLedger: makeStubLedger(1000),
      profileStore: stubProfileStore,
      botInstanceRepo: stubBotInstanceRepo,
      serviceKeyRepo: null,
      provisionSecret: null,
      fleet: makeStubFleet(),
      // operationQueue intentionally omitted
    };
    const inlineSvc = new InstanceService(inlineDeps);
    const result = await inlineSvc.create(makeParams("inline-bot"));
    expect(result.id).toBe("inst-created");
    expect(result.name).toBe("inline-bot");

    // No row landed in pending_operations because the queue was bypassed.
    const rows = await db.query.pendingOperations.findMany();
    expect(rows).toHaveLength(0);
  });
});
