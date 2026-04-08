import type { PGlite } from "@electric-sql/pglite";
import { Credit, DrizzleLedger } from "@wopr-network/platform-core/credits";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrizzleDb } from "../../db/index.js";
import { botInstances } from "../../db/schema/bot-instances.js";
import type { IBotInstanceRepository } from "../../fleet/bot-instance-repository.js";
import { DrizzleBotInstanceRepository } from "../../fleet/drizzle-bot-instance-repository.js";
import type { IOperationQueue } from "../../queue/operation-queue.js";
import { createTestDb, truncateAllTables } from "../../test/db.js";
import { BotBilling, SUSPENSION_GRACE_DAYS } from "./bot-billing.js";

function createMockDeps(nodeId: string | null = "node-1") {
  const operationQueue = {
    execute: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    janitorSweep: vi.fn(),
    startListener: vi.fn(),
    stopListener: vi.fn(),
    subscribeEnqueued: vi.fn(),
  } as unknown as IOperationQueue;
  const botInstanceRepo = {
    getById: vi.fn().mockResolvedValue({
      id: "bot-1",
      tenantId: "tenant-1",
      name: "my-bot",
      nodeId,
      billingState: "active",
      suspendedAt: null,
      destroyAfter: null,
      createdAt: "",
      updatedAt: "",
      createdByUserId: null,
    }),
    listByNode: vi.fn(),
    listByTenant: vi.fn(),
    create: vi.fn(),
    reassign: vi.fn(),
    setBillingState: vi.fn(),
    getResourceTier: vi.fn(),
    setResourceTier: vi.fn(),
    deleteAllByTenant: vi.fn(),
    deleteById: vi.fn(),
    listByNodeWithTier: vi.fn(),
    findByTenantAndNode: vi.fn(),
    countActiveByTenant: vi.fn().mockResolvedValue(0),
    listActiveIdsByTenant: vi.fn().mockResolvedValue([]),
    listSuspendedIdsByTenant: vi.fn().mockResolvedValue([]),
    listExpiredSuspendedIds: vi.fn().mockResolvedValue([]),
    suspend: vi.fn().mockResolvedValue(undefined),
    reactivate: vi.fn().mockResolvedValue(undefined),
    markDestroyed: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    getStorageTier: vi.fn().mockResolvedValue(null),
    setStorageTier: vi.fn().mockResolvedValue(undefined),
    listActiveStorageTiers: vi.fn().mockResolvedValue([]),
  } as IBotInstanceRepository;
  return { operationQueue, botInstanceRepo };
}

describe("BotBilling", () => {
  let pool: PGlite;
  let db: DrizzleDb;
  let repo: DrizzleBotInstanceRepository;
  let billing: BotBilling;
  let ledger: DrizzleLedger;

  beforeAll(async () => {
    ({ db, pool } = await createTestDb());
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    repo = new DrizzleBotInstanceRepository(db);
    billing = new BotBilling(repo);
    ledger = new DrizzleLedger(db);

    await ledger.seedSystemAccounts();
  });

  describe("registerBot", () => {
    it("registers a bot in active billing state", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      const info = await billing.getBotBilling("bot-1");
      expect(info).not.toBeNull();
      expect((info as any)?.billingState).toBe("active");
      expect((info as any)?.tenantId).toBe("tenant-1");
      expect((info as any)?.name).toBe("my-bot");
      expect((info as any)?.suspendedAt).toBeNull();
      expect((info as any)?.destroyAfter).toBeNull();
    });
  });

  describe("getActiveBotCount", () => {
    it("returns 0 when no bots exist", async () => {
      expect(await billing.getActiveBotCount("tenant-1")).toBe(0);
    });

    it("counts only active bots for the tenant", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.registerBot("bot-2", "tenant-1", "bot-b");
      await repo.startBilling("bot-2");
      await billing.registerBot("bot-3", "tenant-2", "bot-c");
      await repo.startBilling("bot-3");

      expect(await billing.getActiveBotCount("tenant-1")).toBe(2);
      expect(await billing.getActiveBotCount("tenant-2")).toBe(1);
    });

    it("does not count suspended bots", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.registerBot("bot-2", "tenant-1", "bot-b");
      await repo.startBilling("bot-2");
      await billing.suspendBot("bot-1");

      expect(await billing.getActiveBotCount("tenant-1")).toBe(1);
    });

    it("does not count destroyed bots", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.destroyBot("bot-1");

      expect(await billing.getActiveBotCount("tenant-1")).toBe(0);
    });
  });

  describe("suspendBot", () => {
    it("transitions bot from active to suspended", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      await billing.suspendBot("bot-1");

      const info = await billing.getBotBilling("bot-1");
      expect((info as any)?.billingState).toBe("suspended");
      expect((info as any)?.suspendedAt).not.toBeNull();
      expect((info as any)?.destroyAfter).not.toBeNull();
    });

    it("sets destroyAfter to 30 days after suspension", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      await billing.suspendBot("bot-1");

      const info = await billing.getBotBilling("bot-1");
      expect(info).not.toBeNull();
      const suspendedAt = new Date((info as any)?.suspendedAt ?? "");
      const destroyAfter = new Date((info as any)?.destroyAfter ?? "");
      const diffDays = Math.round((destroyAfter.getTime() - suspendedAt.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(SUSPENSION_GRACE_DAYS);
    });
  });

  describe("suspendAllForTenant", () => {
    it("suspends all active bots for a tenant", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.registerBot("bot-2", "tenant-1", "bot-b");
      await repo.startBilling("bot-2");
      await billing.registerBot("bot-3", "tenant-2", "bot-c");
      await repo.startBilling("bot-3");

      const suspended = await billing.suspendAllForTenant("tenant-1");

      expect(suspended.sort()).toEqual(["bot-1", "bot-2"]);
      expect(await billing.getActiveBotCount("tenant-1")).toBe(0);
      expect(await billing.getActiveBotCount("tenant-2")).toBe(1);
    });

    it("returns empty array when no active bots", async () => {
      const suspended = await billing.suspendAllForTenant("tenant-1");
      expect(suspended).toEqual([]);
    });
  });

  describe("reactivateBot", () => {
    it("transitions bot from suspended to active", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      await billing.suspendBot("bot-1");
      await billing.reactivateBot("bot-1");

      const info = await billing.getBotBilling("bot-1");
      expect((info as any)?.billingState).toBe("active");
      expect((info as any)?.suspendedAt).toBeNull();
      expect((info as any)?.destroyAfter).toBeNull();
    });

    it("does not reactivate a destroyed bot", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      await billing.destroyBot("bot-1");
      await billing.reactivateBot("bot-1");

      const info = await billing.getBotBilling("bot-1");
      expect((info as any)?.billingState).toBe("destroyed");
    });

    it("does not affect already-active bots", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      await billing.reactivateBot("bot-1");

      const info = await billing.getBotBilling("bot-1");
      expect((info as any)?.billingState).toBe("active");
    });
  });

  describe("checkReactivation", () => {
    it("reactivates suspended bots when balance is positive", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.registerBot("bot-2", "tenant-1", "bot-b");
      await repo.startBilling("bot-2");
      await billing.suspendBot("bot-1");
      await billing.suspendBot("bot-2");

      await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", {
        description: "test credit",
        referenceId: "ref-1",
        fundingSource: "stripe",
      });
      const reactivated = await billing.checkReactivation("tenant-1", ledger);

      expect(reactivated.sort()).toEqual(["bot-1", "bot-2"]);
      expect(await billing.getActiveBotCount("tenant-1")).toBe(2);
    });

    it("does not reactivate when balance is zero", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.suspendBot("bot-1");

      const reactivated = await billing.checkReactivation("tenant-1", ledger);
      expect(reactivated).toEqual([]);
      expect(await billing.getActiveBotCount("tenant-1")).toBe(0);
    });

    it("does not reactivate destroyed bots", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.destroyBot("bot-1");

      await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", {
        description: "test credit",
        referenceId: "ref-1",
        fundingSource: "stripe",
      });
      const reactivated = await billing.checkReactivation("tenant-1", ledger);

      expect(reactivated).toEqual([]);
    });

    it("returns empty array for tenant with no bots", async () => {
      await ledger.credit("tenant-1", Credit.fromCents(500), "purchase", {
        description: "test credit",
        referenceId: "ref-1",
        fundingSource: "stripe",
      });
      const reactivated = await billing.checkReactivation("tenant-1", ledger);
      expect(reactivated).toEqual([]);
    });
  });

  describe("destroyBot", () => {
    it("marks bot as destroyed", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      await billing.destroyBot("bot-1");

      const info = await billing.getBotBilling("bot-1");
      expect((info as any)?.billingState).toBe("destroyed");
    });
  });

  describe("destroyExpiredBots", () => {
    it("destroys bots past their grace period", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");

      // Set destroyAfter to the past using drizzle sql
      await db
        .update(botInstances)
        .set({
          billingState: "suspended",
          suspendedAt: sql`now() - interval '31 days'`,
          destroyAfter: sql`now() - interval '1 day'`,
        })
        .where(sql`id = 'bot-1'`);

      const destroyed = await billing.destroyExpiredBots();
      expect(destroyed).toEqual(["bot-1"]);

      const info = await billing.getBotBilling("bot-1");
      expect((info as any)?.billingState).toBe("destroyed");
    });

    it("does not destroy bots still within grace period", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.suspendBot("bot-1");

      const destroyed = await billing.destroyExpiredBots();
      expect(destroyed).toEqual([]);

      const info = await billing.getBotBilling("bot-1");
      expect((info as any)?.billingState).toBe("suspended");
    });

    it("does not touch active bots", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");

      const destroyed = await billing.destroyExpiredBots();
      expect(destroyed).toEqual([]);
    });
  });

  describe("suspendBot with operation queue", () => {
    it("enqueues bot.stop after DB update", async () => {
      const { operationQueue, botInstanceRepo } = createMockDeps();
      const billingWithQueue = new BotBilling(botInstanceRepo, operationQueue);

      await billingWithQueue.registerBot("bot-1", "tenant-1", "my-bot");
      await billingWithQueue.suspendBot("bot-1");

      expect(operationQueue.execute).toHaveBeenCalledWith({
        type: "bot.stop",
        target: "node-1",
        payload: { name: "my-bot" },
      });
    });

    it("does not throw when queue execute fails", async () => {
      const { operationQueue, botInstanceRepo } = createMockDeps();
      (operationQueue.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("queue unavailable"));
      const billingWithQueue = new BotBilling(botInstanceRepo, operationQueue);

      await billingWithQueue.registerBot("bot-1", "tenant-1", "my-bot");
      await expect(billingWithQueue.suspendBot("bot-1")).resolves.toBeUndefined();
    });

    it("skips enqueue when bot has no nodeId", async () => {
      const { operationQueue, botInstanceRepo } = createMockDeps(null);
      const billingWithQueue = new BotBilling(botInstanceRepo, operationQueue);

      await billingWithQueue.registerBot("bot-1", "tenant-1", "my-bot");
      await billingWithQueue.suspendBot("bot-1");

      expect(operationQueue.execute).not.toHaveBeenCalled();
    });

    it("skips enqueue when no operation queue injected", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await expect(billing.suspendBot("bot-1")).resolves.toBeUndefined();
    });
  });

  describe("reactivateBot with operation queue", () => {
    it("enqueues bot.start after DB update", async () => {
      const { operationQueue, botInstanceRepo } = createMockDeps();
      const billingWithQueue = new BotBilling(botInstanceRepo, operationQueue);

      await billingWithQueue.registerBot("bot-1", "tenant-1", "my-bot");
      await billingWithQueue.suspendBot("bot-1");

      (operationQueue.execute as ReturnType<typeof vi.fn>).mockClear();
      await billingWithQueue.reactivateBot("bot-1");

      expect(operationQueue.execute).toHaveBeenCalledWith({
        type: "bot.start",
        target: "node-1",
        payload: { name: "my-bot" },
      });
    });

    it("does not throw when queue execute fails on reactivate", async () => {
      const { operationQueue, botInstanceRepo } = createMockDeps();
      const billingWithQueue = new BotBilling(botInstanceRepo, operationQueue);

      await billingWithQueue.registerBot("bot-1", "tenant-1", "my-bot");
      await billingWithQueue.suspendBot("bot-1");

      (operationQueue.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
      await expect(billingWithQueue.reactivateBot("bot-1")).resolves.toBeUndefined();
    });
  });

  describe("getStorageTierCostsForTenant", () => {
    it("returns 0 for a tenant with no active bots", async () => {
      expect((await billing.getStorageTierCostsForTenant("tenant-1")).toCents()).toBe(0);
    });

    it("returns correct daily cost for known storage tiers", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.setStorageTier("bot-1", "pro");
      await billing.registerBot("bot-2", "tenant-1", "bot-b");
      await repo.startBilling("bot-2");
      await billing.setStorageTier("bot-2", "plus");

      expect((await billing.getStorageTierCostsForTenant("tenant-1")).toCents()).toBe(11);
    });

    it("returns 0 for unknown storage tier (fallback branch)", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      // Bypass setStorageTier to insert an unrecognized tier value directly
      await pool.query(`UPDATE bot_instances SET storage_tier = 'unknown_tier' WHERE id = 'bot-1'`);

      // STORAGE_TIERS['unknown_tier'] is undefined → Credit.ZERO fallback
      expect((await billing.getStorageTierCostsForTenant("tenant-1")).toCents()).toBe(0);
    });

    it("does not include suspended bots in storage tier cost", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.setStorageTier("bot-1", "pro");
      await billing.suspendBot("bot-1");

      expect((await billing.getStorageTierCostsForTenant("tenant-1")).toCents()).toBe(0);
    });
  });

  describe("listForTenant", () => {
    it("lists all bots regardless of billing state", async () => {
      await billing.registerBot("bot-1", "tenant-1", "bot-a");
      await repo.startBilling("bot-1");
      await billing.registerBot("bot-2", "tenant-1", "bot-b");
      await repo.startBilling("bot-2");
      await billing.registerBot("bot-3", "tenant-2", "bot-c");
      await repo.startBilling("bot-3");
      await billing.suspendBot("bot-2");

      const bots = await billing.listForTenant("tenant-1");
      expect((bots as any[]).length).toBe(2);
    });
  });

  describe("full lifecycle", () => {
    it("active -> suspended -> reactivated -> active", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      expect(((await billing.getBotBilling("bot-1")) as any)?.billingState).toBe("active");

      await billing.suspendBot("bot-1");
      expect(((await billing.getBotBilling("bot-1")) as any)?.billingState).toBe("suspended");

      await billing.reactivateBot("bot-1");
      const info = await billing.getBotBilling("bot-1");
      expect((info as any)?.billingState).toBe("active");
      expect((info as any)?.suspendedAt).toBeNull();
      expect((info as any)?.destroyAfter).toBeNull();
    });

    it("active -> suspended -> destroyed (after grace period)", async () => {
      await billing.registerBot("bot-1", "tenant-1", "my-bot");
      await repo.startBilling("bot-1");
      await billing.suspendBot("bot-1");

      await db.update(botInstances).set({ destroyAfter: sql`now() - interval '1 day'` }).where(sql`id = 'bot-1'`);

      await billing.destroyExpiredBots();
      expect(((await billing.getBotBilling("bot-1")) as any)?.billingState).toBe("destroyed");
    });
  });
});
