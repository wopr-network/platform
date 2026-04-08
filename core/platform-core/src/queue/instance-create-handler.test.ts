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

// ---------------------------------------------------------------------------
// instance.destroy + instance.update_budget
// ---------------------------------------------------------------------------

describe("instance.destroy end-to-end through OperationQueue", () => {
  let queue: OperationQueue;
  let worker: QueueWorker;
  let svc: InstanceService;

  beforeEach(async () => {
    await truncateAllTables(pool);
    queue = new OperationQueue(db, { defaultPollIntervalMs: 0, sleep: fastSleep });
    const deps: InstanceServiceDeps = {
      creditLedger: makeStubLedger(1000),
      botInstanceRepo: stubBotInstanceRepo,
      serviceKeyRepo: null,
      provisionSecret: "test-secret",
      fleet: makeStubFleet(),
      operationQueue: queue,
    };
    svc = new InstanceService(deps);
    worker = new QueueWorker(queue, "core", "w-test", new Map());
    worker.registerHandler("instance.destroy", async (payload) => {
      await svc.handleDestroyOperation(payload);
      return null;
    });
  });

  it("dispatches destroy() through the queue and completes", async () => {
    const promise = svc.destroy({ instanceId: "inst-1", provisionSecret: "test-secret" });
    await fastSleep();
    const ran = await worker.tickOnce();
    expect(ran).toBe(true);
    await expect(promise).resolves.toBeUndefined();

    const rows = await db.query.pendingOperations.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("instance.destroy");
    expect(rows[0].status).toBe("succeeded");
  });

  it("falls back to inline when no queue is wired", async () => {
    const inlineSvc = new InstanceService({
      creditLedger: makeStubLedger(1000),
      botInstanceRepo: stubBotInstanceRepo,
      serviceKeyRepo: null,
      provisionSecret: "x",
      fleet: makeStubFleet(),
    });
    await expect(inlineSvc.destroy({ instanceId: "inst-1", provisionSecret: "x" })).resolves.toBeUndefined();
    expect(await db.query.pendingOperations.findMany()).toHaveLength(0);
  });
});

describe("instance.create_container end-to-end through OperationQueue", () => {
  let queue: OperationQueue;
  let worker: QueueWorker;
  let svc: InstanceService;

  beforeEach(async () => {
    await truncateAllTables(pool);
    queue = new OperationQueue(db, { defaultPollIntervalMs: 0, sleep: fastSleep });
    // Fleet stub's create returns an object that also exposes .start() so
    // runCreateContainer can call instance.start() on it.
    const fleetWithStart = {
      create: async () => ({
        id: "bare-1",
        url: "http://bare-1/",
        containerId: "container-bare-1",
        profile: { name: "bare-bot" },
        start: async () => {},
      }),
      remove: async () => {},
      getInstance: async () => ({ id: "bare-1", url: "http://bare-1/" }),
    } as never;
    const deps: InstanceServiceDeps = {
      creditLedger: makeStubLedger(1000),
      botInstanceRepo: stubBotInstanceRepo,
      serviceKeyRepo: null,
      provisionSecret: null,
      fleet: fleetWithStart,
      operationQueue: queue,
    };
    svc = new InstanceService(deps);
    worker = new QueueWorker(queue, "core", "w-test", new Map());
    worker.registerHandler("instance.create_container", async (payload) => svc.handleCreateContainerOperation(payload));
  });

  it("dispatches createContainer() through the queue and returns the saga result", async () => {
    const promise = svc.createContainer({
      tenantId: "t-1",
      name: "bare-bot",
      image: "worker:1",
      productSlug: "holyship",
    });
    await fastSleep();
    const ran = await worker.tickOnce();
    expect(ran).toBe(true);

    const result = await promise;
    expect(result.id).toBe("bare-1");
    expect(result.url).toBe("http://bare-1/");
    expect(result.name).toBe("bare-bot");

    const rows = await db.query.pendingOperations.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("instance.create_container");
    expect(rows[0].status).toBe("succeeded");
  });
});

describe("instance.update_budget end-to-end through OperationQueue", () => {
  let queue: OperationQueue;
  let svc: InstanceService;

  beforeEach(async () => {
    await truncateAllTables(pool);
    queue = new OperationQueue(db, { defaultPollIntervalMs: 0, sleep: fastSleep });
  });

  it("dispatches through the queue (even when underlying call fails, row reaches terminal state)", async () => {
    // The stub fleet's getInstance returns a canned Instance, and the real
    // provision-client import will fail to actually reach the URL. We expect
    // the row to land in `failed` and the Promise to reject — proving the
    // queue transport itself works.
    const deps: InstanceServiceDeps = {
      creditLedger: makeStubLedger(1000),
      botInstanceRepo: stubBotInstanceRepo,
      serviceKeyRepo: null,
      provisionSecret: "s",
      fleet: makeStubFleet(),
      operationQueue: queue,
    };
    svc = new InstanceService(deps);
    const worker = new QueueWorker(queue, "core", "w-ub", new Map());
    worker.registerHandler("instance.update_budget", async (payload) => {
      await svc.handleUpdateBudgetOperation(payload);
      return null;
    });

    const promise = svc.updateBudget({
      instanceId: "inst-1",
      provisionSecret: "s",
      tenantEntityId: "t-1",
      budgetCents: 100,
    });
    await fastSleep();
    await worker.tickOnce();

    // The row reached a terminal state — either succeeded (unlikely, no
    // real HTTP target) or failed with the fetch error. Either way the
    // queue transport completed.
    await promise.catch(() => {}); // swallow to inspect row
    const rows = await db.query.pendingOperations.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("instance.update_budget");
    expect(["succeeded", "failed"]).toContain(rows[0].status);
  });
});
