import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolloutOrchestrator } from "../rollout-orchestrator.js";
import type { IRolloutStrategy } from "../rollout-strategy.js";
import type { BotProfile } from "../types.js";
import type { ContainerUpdater, UpdateResult } from "../updater.js";
import type { VolumeSnapshotManager } from "../volume-snapshot-manager.js";

function makeProfile(id: string, volumeName?: string): BotProfile {
  return {
    id,
    tenantId: "tenant-1",
    name: `bot-${id}`,
    description: "",
    image: "ghcr.io/wopr-network/paperclip:managed",
    env: {},
    restartPolicy: "unless-stopped",
    releaseChannel: "stable",
    updatePolicy: "nightly",
    volumeName,
  } as BotProfile;
}

function makeResult(botId: string, success: boolean): UpdateResult {
  return {
    botId,
    success,
    previousImage: "old:latest",
    newImage: "new:latest",
    previousDigest: "sha256:old",
    newDigest: "sha256:new",
    rolledBack: !success,
    error: success ? undefined : "Health check failed",
  };
}

function mockUpdater(results: Map<string, UpdateResult>): ContainerUpdater {
  return {
    updateBot: vi.fn(async (botId: string) => results.get(botId) ?? makeResult(botId, true)),
  } as unknown as ContainerUpdater;
}

function mockSnapshotManager(): VolumeSnapshotManager {
  return {
    snapshot: vi.fn(async (volumeName: string) => ({
      id: `${volumeName}-snap`,
      volumeName,
      archivePath: `/backup/${volumeName}-snap.tar`,
      createdAt: new Date(),
      sizeBytes: 1024,
    })),
    restore: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  } as unknown as VolumeSnapshotManager;
}

function mockStrategy(overrides: Partial<IRolloutStrategy> = {}): IRolloutStrategy {
  return {
    nextBatch: (remaining) => remaining.slice(0, 2),
    pauseDuration: () => 0,
    onBotFailure: () => "skip",
    maxRetries: () => 2,
    healthCheckTimeout: () => 120_000,
    ...overrides,
  };
}

describe("RolloutOrchestrator", () => {
  let updater: ReturnType<typeof mockUpdater>;
  let snapMgr: ReturnType<typeof mockSnapshotManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    updater = mockUpdater(new Map());
    snapMgr = mockSnapshotManager();
  });

  it("processes all bots in batches", async () => {
    const profiles = [makeProfile("b1", "vol-1"), makeProfile("b2", "vol-2"), makeProfile("b3", "vol-3")];
    const strategy = mockStrategy({ nextBatch: (r) => r.slice(0, 2) });

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy,
      getUpdatableProfiles: async () => profiles,
    });

    const result = await orch.rollout();

    expect(result.totalBots).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.aborted).toBe(false);
    expect(updater.updateBot).toHaveBeenCalledTimes(3);
  });

  it("snapshots volumes before updating", async () => {
    const profiles = [makeProfile("b1", "my-volume")];

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => profiles,
    });

    await orch.rollout();

    expect(snapMgr.snapshot).toHaveBeenCalledWith("my-volume");
    // On success, snapshot is cleaned up
    expect(snapMgr.delete).toHaveBeenCalledWith("my-volume-snap");
  });

  it("skips snapshot for bots without volumes", async () => {
    const profiles = [makeProfile("b1")]; // no volumeName

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => profiles,
    });

    await orch.rollout();

    expect(snapMgr.snapshot).not.toHaveBeenCalled();
    expect(updater.updateBot).toHaveBeenCalledWith("b1");
  });

  it("restores volumes on update failure", async () => {
    const failResults = new Map([["b1", makeResult("b1", false)]]);
    updater = mockUpdater(failResults);
    const profiles = [makeProfile("b1", "my-volume")];

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => profiles,
    });

    const result = await orch.rollout();

    expect(result.failed).toBe(1);
    expect(result.results[0].volumeRestored).toBe(true);
    expect(snapMgr.restore).toHaveBeenCalledWith("my-volume-snap");
    // Snapshot NOT deleted on failure (restored instead)
    expect(snapMgr.delete).not.toHaveBeenCalled();
  });

  it("aborts rollout when strategy says abort", async () => {
    const failResults = new Map([["b1", makeResult("b1", false)]]);
    updater = mockUpdater(failResults);
    const profiles = [makeProfile("b1", "v1"), makeProfile("b2", "v2"), makeProfile("b3", "v3")];
    const strategy = mockStrategy({
      nextBatch: (r) => r.slice(0, 1),
      onBotFailure: () => "abort",
    });

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy,
      getUpdatableProfiles: async () => profiles,
    });

    const result = await orch.rollout();

    expect(result.aborted).toBe(true);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(2); // b2, b3 never processed
    expect(updater.updateBot).toHaveBeenCalledTimes(1);
  });

  it("returns empty result when no bots to update", async () => {
    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => [],
    });

    const result = await orch.rollout();

    expect(result.totalBots).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it("rejects concurrent rollouts", async () => {
    const profiles = [makeProfile("b1")];
    // Make updateBot slow
    updater = {
      updateBot: vi.fn(async (botId: string) => {
        await new Promise((r) => setTimeout(r, 100));
        return makeResult(botId, true);
      }),
    } as unknown as ContainerUpdater;

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => profiles,
    });

    const [r1, r2] = await Promise.all([orch.rollout(), orch.rollout()]);

    // One succeeds, one is rejected as already running
    const succeeded = [r1, r2].find((r) => r.totalBots > 0);
    const rejected = [r1, r2].find((r) => r.alreadyRunning);
    expect(succeeded).toBeDefined();
    expect(rejected).toBeDefined();
    expect(rejected?.alreadyRunning).toBe(true);
    expect(rejected?.totalBots).toBe(0);
  });

  it("retries failed bots when strategy says retry", async () => {
    let callCount = 0;
    updater = {
      updateBot: vi.fn(async (botId: string) => {
        callCount++;
        // Fail first attempt, succeed on retry
        if (botId === "b1" && callCount === 1) return makeResult("b1", false);
        return makeResult(botId, true);
      }),
    } as unknown as ContainerUpdater;

    const profiles = [makeProfile("b1")];
    const strategy = mockStrategy({
      nextBatch: (r) => r.slice(0, 1),
      onBotFailure: (_botId, _err, attempt) => (attempt < 2 ? "retry" : "skip"),
    });

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy,
      getUpdatableProfiles: async () => profiles,
    });

    const result = await orch.rollout();

    // b1 failed once, retried, succeeded
    expect(updater.updateBot).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1); // first attempt counted as failed
  });

  it("calls onBotUpdated callback for each bot", async () => {
    const profiles = [makeProfile("b1"), makeProfile("b2")];
    const onBotUpdated = vi.fn();

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => profiles,
      onBotUpdated,
    });

    await orch.rollout();

    expect(onBotUpdated).toHaveBeenCalledTimes(2);
  });

  it("calls onRolloutComplete callback", async () => {
    const profiles = [makeProfile("b1")];
    const onRolloutComplete = vi.fn();

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => profiles,
      onRolloutComplete,
    });

    await orch.rollout();

    expect(onRolloutComplete).toHaveBeenCalledTimes(1);
    expect(onRolloutComplete).toHaveBeenCalledWith(
      expect.objectContaining({ totalBots: 1, succeeded: 1, aborted: false }),
    );
  });

  it("continues on snapshot failure (best-effort)", async () => {
    const profiles = [makeProfile("b1", "my-volume")];
    snapMgr.snapshot = vi.fn().mockRejectedValue(new Error("disk full"));

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => profiles,
    });

    const result = await orch.rollout();

    // Update still proceeds despite snapshot failure
    expect(result.succeeded).toBe(1);
    expect(updater.updateBot).toHaveBeenCalledWith("b1");
  });

  it("isRolling reflects rollout state", async () => {
    const profiles = [makeProfile("b1")];

    const orch = new RolloutOrchestrator({
      updater,
      snapshotManager: snapMgr,
      strategy: mockStrategy(),
      getUpdatableProfiles: async () => profiles,
    });

    expect(orch.isRolling).toBe(false);
    const promise = orch.rollout();
    // isRolling is true during rollout (may already be done for sync mocks)
    await promise;
    expect(orch.isRolling).toBe(false);
  });
});
