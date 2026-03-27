import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { BotMetricsTracker } from "../gateway/bot-metrics-tracker.js";
import type { FleetEventEmitter } from "./fleet-event-emitter.js";
import { Instance, type InstanceDeps } from "./instance.js";
import type { BotProfile } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<BotProfile> = {}): BotProfile {
  return {
    id: "bot-1",
    tenantId: "tenant-1",
    name: "test-bot",
    description: "A test bot",
    image: "ghcr.io/wopr-network/test:latest",
    env: {},
    restartPolicy: "unless-stopped",
    releaseChannel: "stable",
    updatePolicy: "manual",
    ...overrides,
  };
}

/** Build a mock Docker.Container with sensible defaults */
function mockContainer(state: Partial<{ Running: boolean; Status: string }> = { Running: true, Status: "running" }) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({
      Id: "abc123",
      Name: "/wopr-test-bot",
      Created: "2026-01-01T00:00:00Z",
      State: {
        Running: state.Running ?? true,
        Status: state.Status ?? "running",
        StartedAt: "2026-01-01T00:00:00Z",
        Health: { Status: "healthy" },
      },
      NetworkSettings: { Ports: {} },
    }),
    logs: vi.fn(),
    stats: vi.fn().mockResolvedValue({
      cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1000, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 500 },
      memory_stats: { usage: 100 * 1024 * 1024, limit: 512 * 1024 * 1024 },
    }),
    exec: vi.fn(),
  };
}

function mockDocker(container: ReturnType<typeof mockContainer>) {
  return {
    getContainer: vi.fn().mockReturnValue(container),
    pull: vi.fn(),
    modem: {
      followProgress: vi.fn((_stream: unknown, cb: (err: Error | null) => void) => cb(null)),
      demuxStream: vi.fn(),
    },
  } as unknown as InstanceDeps["docker"];
}

function mockEventEmitter(): FleetEventEmitter {
  return { emit: vi.fn() } as unknown as FleetEventEmitter;
}

function mockMetricsTracker(): BotMetricsTracker {
  return { reset: vi.fn(), getMetrics: vi.fn().mockReturnValue(null) } as unknown as BotMetricsTracker;
}

function buildInstance(overrides: Partial<InstanceDeps> = {}): {
  instance: Instance;
  container: ReturnType<typeof mockContainer>;
  docker: InstanceDeps["docker"];
  emitter: FleetEventEmitter;
  metrics: BotMetricsTracker;
} {
  const container = mockContainer();
  const docker = mockDocker(container);
  const emitter = mockEventEmitter();
  const metrics = mockMetricsTracker();
  const profile = makeProfile();

  const instance = new Instance({
    docker,
    profile,
    containerId: "abc123",
    containerName: "wopr-test-bot",
    url: "http://wopr-test-bot:7437",
    eventEmitter: emitter,
    botMetricsTracker: metrics,
    ...overrides,
  });

  return { instance, container, docker, emitter, metrics };
}

function buildRemoteInstance(): Instance {
  const container = mockContainer();
  const docker = mockDocker(container);
  return new Instance({
    docker,
    profile: makeProfile(),
    containerId: "remote:node-3",
    containerName: "wopr-test-bot",
    url: "remote://node-3/wopr-test-bot",
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Instance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // P0: Remote guard
  // -----------------------------------------------------------------------
  describe("remote instances", () => {
    const ops = [
      "start",
      "stop",
      "restart",
      "remove",
      "pullImage",
      "logs",
      "logStream",
      "getVolumeUsage",
      "status",
      "containerState",
    ] as const;

    for (const op of ops) {
      it(`${op}() throws on remote instance`, async () => {
        const remote = buildRemoteInstance();
        const args = op === "logStream" ? [{}] : [];
        await expect((remote[op] as (...a: unknown[]) => Promise<unknown>)(...args)).rejects.toThrow(
          "not supported on remote instances",
        );
      });
    }

    it("emitCreated() works on remote instances (no Docker)", () => {
      const emitter = mockEventEmitter();
      const docker = mockDocker(mockContainer());
      const remote = new Instance({
        docker,
        profile: makeProfile(),
        containerId: "remote:node-5",
        containerName: "wopr-test-bot",
        url: "remote://node-5/wopr-test-bot",
        eventEmitter: emitter,
      });
      expect(() => remote.emitCreated()).not.toThrow();
      expect((emitter.emit as Mock).mock.calls[0][0]).toMatchObject({ type: "bot.created" });
    });
  });

  // -----------------------------------------------------------------------
  // restart()
  // -----------------------------------------------------------------------
  describe("restart()", () => {
    it("restarts a running container and emits event", async () => {
      const { instance, container, emitter } = buildInstance();
      await instance.restart();
      expect(container.inspect).toHaveBeenCalled();
      expect(container.restart).toHaveBeenCalled();
      expect((emitter.emit as Mock).mock.calls[0][0]).toMatchObject({ type: "bot.restarted" });
    });

    it("rejects when container is in paused state", async () => {
      const container = mockContainer({ Running: false, Status: "paused" });
      const docker = mockDocker(container);
      const instance = new Instance({
        docker,
        profile: makeProfile(),
        containerId: "abc123",
        containerName: "wopr-test-bot",
        url: "http://wopr-test-bot:7437",
      });
      await expect(instance.restart()).rejects.toThrow(/Cannot restart.*paused/);
    });

    it("accepts stopped/exited/dead states", async () => {
      for (const status of ["stopped", "exited", "dead"]) {
        const container = mockContainer({ Running: false, Status: status });
        const docker = mockDocker(container);
        const instance = new Instance({
          docker,
          profile: makeProfile(),
          containerId: "abc123",
          containerName: "wopr-test-bot",
          url: "http://wopr-test-bot:7437",
        });
        await expect(instance.restart()).resolves.toBeUndefined();
      }
    });

    it("resets metrics tracker on restart", async () => {
      const { instance, metrics } = buildInstance();
      await instance.restart();
      expect(metrics.reset as Mock).toHaveBeenCalledWith("bot-1");
    });
  });

  // -----------------------------------------------------------------------
  // pullImage()
  // -----------------------------------------------------------------------
  describe("pullImage()", () => {
    it("pulls image without auth when no env vars set", async () => {
      const { instance, docker } = buildInstance();
      const pullMock = docker.pull as Mock;
      pullMock.mockResolvedValue("stream");
      await instance.pullImage();
      expect(pullMock).toHaveBeenCalledWith("ghcr.io/wopr-network/test:latest", {});
    });

    it("pulls image with auth when registry env vars are set", async () => {
      process.env.REGISTRY_USERNAME = "user";
      process.env.REGISTRY_PASSWORD = "pass";
      process.env.REGISTRY_SERVER = "ghcr.io";
      try {
        const { instance, docker } = buildInstance();
        const pullMock = docker.pull as Mock;
        pullMock.mockResolvedValue("stream");
        await instance.pullImage();
        expect(pullMock).toHaveBeenCalledWith("ghcr.io/wopr-network/test:latest", {
          authconfig: { username: "user", password: "pass", serveraddress: "ghcr.io" },
        });
      } finally {
        delete process.env.REGISTRY_USERNAME;
        delete process.env.REGISTRY_PASSWORD;
        delete process.env.REGISTRY_SERVER;
      }
    });
  });

  // -----------------------------------------------------------------------
  // logs()
  // -----------------------------------------------------------------------
  describe("logs()", () => {
    it("returns demuxed log output", async () => {
      const { instance, container } = buildInstance();
      // Build a Docker multiplexed frame: 8-byte header + payload
      const payload = Buffer.from("hello from container\n");
      const header = Buffer.alloc(8);
      header.writeUInt8(1, 0); // stdout stream
      header.writeUInt32BE(payload.length, 4);
      const frame = Buffer.concat([header, payload]);
      container.logs.mockResolvedValue(frame);

      const result = await instance.logs(50);
      expect(result).toBe("hello from container\n");
      expect(container.logs).toHaveBeenCalledWith(
        expect.objectContaining({ stdout: true, stderr: true, tail: 50, timestamps: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getVolumeUsage()
  // -----------------------------------------------------------------------
  describe("getVolumeUsage()", () => {
    it("returns parsed df output for a running container", async () => {
      const { instance, container } = buildInstance();
      const dfOutput =
        "Filesystem      1B-blocks      Used Available Use% Mounted on\n/dev/sda1  1073741824 536870912 536870912  50% /data\n";
      const mockStream = new PassThrough();
      const execObj = {
        start: vi.fn((_opts: unknown, cb: (err: Error | null, stream: NodeJS.ReadableStream) => void) => {
          cb(null, mockStream);
          mockStream.end(dfOutput);
        }),
      };
      container.exec.mockResolvedValue(execObj);

      const result = await instance.getVolumeUsage();
      expect(result).toEqual({
        totalBytes: 1073741824,
        usedBytes: 536870912,
        availableBytes: 536870912,
      });
    });

    it("returns null when container is not running", async () => {
      const container = mockContainer({ Running: false, Status: "stopped" });
      const docker = mockDocker(container);
      const instance = new Instance({
        docker,
        profile: makeProfile(),
        containerId: "abc123",
        containerName: "wopr-test-bot",
        url: "http://wopr-test-bot:7437",
      });
      const result = await instance.getVolumeUsage();
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // status()
  // -----------------------------------------------------------------------
  describe("status()", () => {
    it("returns BotStatus with stats for running container", async () => {
      const { instance } = buildInstance();
      const st = await instance.status();
      expect(st.id).toBe("bot-1");
      expect(st.state).toBe("running");
      expect(st.containerId).toBe("abc123");
      expect(st.stats).toBeDefined();
      expect(st.stats?.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(st.stats?.memoryUsageMb).toBe(100);
      expect(st.health).toBe("healthy");
    });

    it("returns offline status when container is gone", async () => {
      const container = mockContainer();
      container.inspect.mockRejectedValue(new Error("No such container"));
      const docker = mockDocker(container);
      const instance = new Instance({
        docker,
        profile: makeProfile(),
        containerId: "abc123",
        containerName: "wopr-test-bot",
        url: "http://wopr-test-bot:7437",
      });
      const st = await instance.status();
      expect(st.state).toBe("stopped");
      expect(st.containerId).toBeNull();
      expect(st.stats).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Concurrency lock
  // -----------------------------------------------------------------------
  describe("withLock serialization", () => {
    it("serializes concurrent restart calls", async () => {
      const callOrder: string[] = [];
      const container = mockContainer();
      const docker = mockDocker(container);

      // Make restart take some time
      container.inspect.mockImplementation(async () => {
        callOrder.push("inspect-start");
        await new Promise((r) => setTimeout(r, 50));
        callOrder.push("inspect-end");
        return {
          Id: "abc123",
          Name: "/wopr-test-bot",
          Created: "2026-01-01T00:00:00Z",
          State: { Running: true, Status: "running", StartedAt: "2026-01-01T00:00:00Z" },
        };
      });
      container.restart.mockImplementation(async () => {
        callOrder.push("restart");
      });

      const instance = new Instance({
        docker,
        profile: makeProfile(),
        containerId: "abc123",
        containerName: "wopr-test-bot",
        url: "http://wopr-test-bot:7437",
      });

      // Fire two concurrent restarts
      const p1 = instance.restart();
      const p2 = instance.restart();

      // Advance timers to let both complete
      await vi.advanceTimersByTimeAsync(200);
      await Promise.all([p1, p2]);

      // Should see two full cycles without interleaving
      expect(callOrder).toEqual(["inspect-start", "inspect-end", "restart", "inspect-start", "inspect-end", "restart"]);
    });
  });
});
