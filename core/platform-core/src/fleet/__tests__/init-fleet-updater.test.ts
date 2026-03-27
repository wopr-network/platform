import type Docker from "dockerode";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IBotProfileRepository } from "../bot-profile-repository.js";
import type { FleetManager } from "../fleet-manager.js";
import { initFleetUpdater } from "../init-fleet-updater.js";
import type { IProfileStore } from "../profile-store.js";

function mockDocker(): Docker {
  return {} as Docker;
}

function mockFleet(): FleetManager {
  return {} as FleetManager;
}

function mockStore(): IProfileStore {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => undefined),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  } as unknown as IProfileStore;
}

function mockRepo(profiles: unknown[] = []): IBotProfileRepository {
  return {
    list: vi.fn(async () => profiles),
    get: vi.fn(async () => null),
    save: vi.fn(async (p: unknown) => p),
    delete: vi.fn(async () => true),
  } as unknown as IBotProfileRepository;
}

describe("initFleetUpdater", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a handle with all components", async () => {
    const handle = initFleetUpdater(mockDocker(), mockFleet(), mockStore(), mockRepo());

    expect(handle.poller).toBeDefined();
    expect(handle.updater).toBeDefined();
    expect(handle.orchestrator).toBeDefined();
    expect(handle.snapshotManager).toBeDefined();
    expect(handle.stop).toBeTypeOf("function");

    await handle.stop();
  });

  it("wires poller.onUpdateAvailable to orchestrator", async () => {
    const handle = initFleetUpdater(mockDocker(), mockFleet(), mockStore(), mockRepo());

    expect(handle.poller.onUpdateAvailable).toBeTypeOf("function");

    await handle.stop();
  });

  it("accepts custom strategy config", async () => {
    const handle = initFleetUpdater(mockDocker(), mockFleet(), mockStore(), mockRepo(), {
      strategy: "immediate",
      snapshotDir: "/tmp/snapshots",
    });

    expect(handle.orchestrator).toBeDefined();

    await handle.stop();
  });

  it("accepts callbacks", async () => {
    const onBotUpdated = vi.fn();
    const onRolloutComplete = vi.fn();

    const handle = initFleetUpdater(mockDocker(), mockFleet(), mockStore(), mockRepo(), {
      onBotUpdated,
      onRolloutComplete,
    });

    expect(handle.orchestrator).toBeDefined();

    await handle.stop();
  });

  it("stop() stops the poller", async () => {
    const handle = initFleetUpdater(mockDocker(), mockFleet(), mockStore(), mockRepo());

    const stopSpy = vi.spyOn(handle.poller, "stop");

    await handle.stop();

    expect(stopSpy).toHaveBeenCalled();
  });

  it("filters manual-policy bots from updatable profiles", async () => {
    const repo = mockRepo([
      { id: "b1", updatePolicy: "nightly" },
      { id: "b2", updatePolicy: "manual" },
      { id: "b3", updatePolicy: "on-push" },
    ]);

    const handle = initFleetUpdater(mockDocker(), mockFleet(), mockStore(), repo, {
      strategy: "immediate",
    });

    const rolloutResult = await handle.orchestrator.rollout();

    // b2 (manual) should be filtered out, b1 and b3 included
    expect(rolloutResult.totalBots).toBe(2);

    await handle.stop();
  });

  it("uses profileRepo for updatable profiles, not profileStore", async () => {
    const store = mockStore();
    const repo = mockRepo([{ id: "b1", updatePolicy: "nightly" }]);

    const handle = initFleetUpdater(mockDocker(), mockFleet(), store, repo, {
      strategy: "immediate",
    });

    await handle.orchestrator.rollout();

    // profileRepo.list() was called for updatable profiles
    expect(repo.list).toHaveBeenCalled();
    // profileStore.list() may also be called by ImagePoller — that's expected

    await handle.stop();
  });
});
