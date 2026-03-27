/**
 * Tests the profile-filtering + onManualTenantsSkipped logic used inside initFleetUpdater.
 *
 * We can't import initFleetUpdater directly because it constructs ImagePoller,
 * ContainerUpdater, etc. which pull in heavy dependencies that cause hangs.
 * Instead, we replicate the getUpdatableProfiles closure from initFleetUpdater
 * and test it in isolation via a RolloutOrchestrator with mock deps.
 */
import { describe, expect, it, vi } from "vitest";
import type { IBotProfileRepository } from "./bot-profile-repository.js";
import { RolloutOrchestrator } from "./rollout-orchestrator.js";
import type { IRolloutStrategy } from "./rollout-strategy.js";
import type { ITenantUpdateConfigRepository } from "./tenant-update-config-repository.js";
import type { BotProfile } from "./types.js";
import type { ContainerUpdater } from "./updater.js";
import type { VolumeSnapshotManager } from "./volume-snapshot-manager.js";

vi.mock("../config/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfileWithFields(fields: { id: string; tenantId: string; updatePolicy: "auto" | "manual" }): BotProfile {
  return {
    ...fields,
    image: "ghcr.io/org/img:latest",
  } as unknown as BotProfile;
}

function makeProfileRepo(profiles: BotProfile[]): IBotProfileRepository {
  return {
    list: vi.fn().mockResolvedValue(profiles),
    get: vi
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(profiles.find((p) => (p as unknown as { id: string }).id === id) ?? null),
      ),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
  } as unknown as IBotProfileRepository;
}

function makeConfigRepo(
  configs: Record<string, { mode: "auto" | "manual"; preferredHourUtc: number }> = {},
): ITenantUpdateConfigRepository {
  return {
    get: vi.fn().mockImplementation((tenantId: string) => {
      const cfg = configs[tenantId];
      return Promise.resolve(cfg ? { tenantId, ...cfg, updatedAt: Date.now() } : null);
    }),
    upsert: vi.fn().mockResolvedValue(undefined),
    listAutoEnabled: vi.fn().mockResolvedValue([]),
  };
}

function makeMockUpdater(): ContainerUpdater {
  return {
    updateBot: vi.fn().mockResolvedValue({
      botId: "",
      success: true,
      previousImage: "",
      newImage: "",
      previousDigest: null,
      newDigest: null,
      rolledBack: false,
    }),
  } as unknown as ContainerUpdater;
}

function makeMockSnapshotManager(): VolumeSnapshotManager {
  return {
    snapshot: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(),
  } as unknown as VolumeSnapshotManager;
}

function makeMockStrategy(): IRolloutStrategy {
  return {
    nextBatch: vi.fn().mockImplementation((remaining: BotProfile[]) => remaining),
    pauseDuration: vi.fn().mockReturnValue(0),
    onBotFailure: vi.fn().mockReturnValue("skip" as const),
    maxRetries: vi.fn().mockReturnValue(0),
    healthCheckTimeout: vi.fn().mockReturnValue(0),
  };
}

/**
 * Builds the same getUpdatableProfiles closure that initFleetUpdater creates,
 * so we can test the filtering + callback logic without importing the heavy module.
 */
function buildGetUpdatableProfiles(
  profileRepo: IBotProfileRepository,
  configRepo: ITenantUpdateConfigRepository | undefined,
  onManualTenantsSkipped: ((tenantIds: string[], imageTag: string) => void) | undefined,
  imageTag = "v1.2.3",
): () => Promise<BotProfile[]> {
  return async () => {
    const profiles = await profileRepo.list();

    const manualPolicyIds: string[] = [];
    const nonManualPolicy = profiles.filter((p) => {
      if (p.updatePolicy === "manual") {
        manualPolicyIds.push(p.tenantId);
        return false;
      }
      return true;
    });

    if (!configRepo) {
      if (manualPolicyIds.length > 0 && onManualTenantsSkipped) {
        onManualTenantsSkipped([...new Set(manualPolicyIds)], imageTag);
      }
      return nonManualPolicy;
    }

    const configManualIds: string[] = [];
    const results = await Promise.all(
      nonManualPolicy.map(async (p) => {
        const tenantCfg = await configRepo.get(p.tenantId);
        if (tenantCfg && tenantCfg.mode === "manual") {
          configManualIds.push(p.tenantId);
          return null;
        }
        return p;
      }),
    );

    const allManualIds = [...manualPolicyIds, ...configManualIds];
    if (allManualIds.length > 0 && onManualTenantsSkipped) {
      onManualTenantsSkipped([...new Set(allManualIds)], imageTag);
    }

    return results.filter((p): p is BotProfile => p !== null);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("initFleetUpdater — onManualTenantsSkipped", () => {
  it("callback fires with tenant IDs of manual-mode tenants (policy-based)", async () => {
    const profiles = [
      makeProfileWithFields({ id: "b1", tenantId: "t-manual", updatePolicy: "manual" }),
      makeProfileWithFields({ id: "b2", tenantId: "t-auto", updatePolicy: "auto" }),
    ];
    const profileRepo = makeProfileRepo(profiles);
    const onManualTenantsSkipped = vi.fn();

    const orchestrator = new RolloutOrchestrator({
      updater: makeMockUpdater(),
      snapshotManager: makeMockSnapshotManager(),
      strategy: makeMockStrategy(),
      getUpdatableProfiles: buildGetUpdatableProfiles(profileRepo, undefined, onManualTenantsSkipped),
    });

    await orchestrator.rollout();

    expect(onManualTenantsSkipped).toHaveBeenCalledWith(["t-manual"], "v1.2.3");
  });

  it("callback deduplicates tenant IDs", async () => {
    const profiles = [
      makeProfileWithFields({ id: "b1", tenantId: "t-dup", updatePolicy: "manual" }),
      makeProfileWithFields({ id: "b2", tenantId: "t-dup", updatePolicy: "manual" }),
      makeProfileWithFields({ id: "b3", tenantId: "t-auto", updatePolicy: "auto" }),
    ];
    const profileRepo = makeProfileRepo(profiles);
    const onManualTenantsSkipped = vi.fn();

    const orchestrator = new RolloutOrchestrator({
      updater: makeMockUpdater(),
      snapshotManager: makeMockSnapshotManager(),
      strategy: makeMockStrategy(),
      getUpdatableProfiles: buildGetUpdatableProfiles(profileRepo, undefined, onManualTenantsSkipped),
    });

    await orchestrator.rollout();

    expect(onManualTenantsSkipped).toHaveBeenCalledWith(["t-dup"], "v1.2.3");
  });

  it("callback not called when no manual tenants exist", async () => {
    const profiles = [
      makeProfileWithFields({ id: "b1", tenantId: "t1", updatePolicy: "auto" }),
      makeProfileWithFields({ id: "b2", tenantId: "t2", updatePolicy: "auto" }),
    ];
    const profileRepo = makeProfileRepo(profiles);
    const onManualTenantsSkipped = vi.fn();

    const orchestrator = new RolloutOrchestrator({
      updater: makeMockUpdater(),
      snapshotManager: makeMockSnapshotManager(),
      strategy: makeMockStrategy(),
      getUpdatableProfiles: buildGetUpdatableProfiles(profileRepo, undefined, onManualTenantsSkipped),
    });

    await orchestrator.rollout();

    expect(onManualTenantsSkipped).not.toHaveBeenCalled();
  });

  it("callback fires with config-repo manual tenants when configRepo is provided", async () => {
    const profiles = [
      makeProfileWithFields({ id: "b1", tenantId: "t-cfg-manual", updatePolicy: "auto" }),
      makeProfileWithFields({ id: "b2", tenantId: "t-cfg-auto", updatePolicy: "auto" }),
    ];
    const profileRepo = makeProfileRepo(profiles);
    const configRepo = makeConfigRepo({
      "t-cfg-manual": { mode: "manual", preferredHourUtc: 3 },
    });
    const onManualTenantsSkipped = vi.fn();

    const orchestrator = new RolloutOrchestrator({
      updater: makeMockUpdater(),
      snapshotManager: makeMockSnapshotManager(),
      strategy: makeMockStrategy(),
      getUpdatableProfiles: buildGetUpdatableProfiles(profileRepo, configRepo, onManualTenantsSkipped),
    });

    await orchestrator.rollout();

    expect(onManualTenantsSkipped).toHaveBeenCalledWith(["t-cfg-manual"], "v1.2.3");
  });
});
