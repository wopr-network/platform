import { afterEach, describe, expect, it, vi } from "vitest";

// Mock trpc vanilla client
const mockListInstances = vi.fn();
const mockGetInstance = vi.fn();
const mockCreateInstance = vi.fn();
const mockControlInstance = vi.fn();
const mockGetInstanceHealth = vi.fn();
const mockGetInstanceLogs = vi.fn();
const mockGetInstanceMetrics = vi.fn();
const mockListTemplates = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    fleet: {
      listInstances: { query: mockListInstances },
      getInstance: { query: mockGetInstance },
      createInstance: { mutate: mockCreateInstance },
      controlInstance: { mutate: mockControlInstance },
      getInstanceHealth: { query: mockGetInstanceHealth },
      getInstanceLogs: { query: mockGetInstanceLogs },
      getInstanceMetrics: { query: mockGetInstanceMetrics },
      listTemplates: { query: mockListTemplates },
    },
  },
  trpc: {},
}));

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "https://api.test/api",
  PLATFORM_BASE_URL: "https://api.test",
}));

// Do NOT mock fetch -- we want to verify it's NOT called for fleet operations
const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

describe("listInstances uses tRPC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls trpcVanilla.fleet.listInstances.query instead of fetch", async () => {
    mockListInstances.mockResolvedValueOnce({
      bots: [
        {
          id: "bot-1",
          name: "test-bot",
          state: "running",
          health: "healthy",
          uptime: "2026-02-20T10:00:00Z",
          startedAt: null,
          createdAt: "2026-02-19T10:00:00Z",
          env: {},
          stats: null,
        },
      ],
    });

    const { listInstances } = await import("@/lib/api");
    const result = await listInstances();

    expect(mockListInstances).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("/fleet/"),
      expect.anything(),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("bot-1");
    expect(result[0].status).toBe("running");
  });
});

describe("getInstance uses tRPC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls trpcVanilla.fleet.getInstance.query with { id }", async () => {
    mockGetInstance.mockResolvedValueOnce({
      id: "bot-1",
      name: "test-bot",
      state: "running",
      health: "healthy",
      uptime: "2026-02-20T10:00:00Z",
      startedAt: null,
      createdAt: "2026-02-19T10:00:00Z",
      env: {},
      stats: { cpuPercent: 5, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });

    const { getInstance } = await import("@/lib/api");
    const result = await getInstance("bot-1");

    expect(mockGetInstance).toHaveBeenCalledWith({ id: "bot-1" });
    expect(result.id).toBe("bot-1");
    expect(result.resourceUsage.cpuPercent).toBe(5);
    expect(result.resourceUsage.memoryMb).toBe(128);
  });
});

describe("createInstance uses tRPC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls trpcVanilla.fleet.createInstance.mutate", async () => {
    mockCreateInstance.mockResolvedValueOnce({
      id: "new-bot-1",
      name: "my-bot",
      state: "stopped",
    });

    const { createInstance } = await import("@/lib/api");
    const result = await createInstance({
      name: "my-bot",
      template: "Custom",
      provider: "anthropic",
      channels: ["discord"],
      plugins: [],
    });

    expect(mockCreateInstance).toHaveBeenCalledWith({
      name: "my-bot",
      image: "ghcr.io/wopr-network/wopr:latest",
      template: "Custom",
      provider: "anthropic",
      channels: ["discord"],
      plugins: [],
    });
    expect(result.id).toBe("new-bot-1");
  });
});

describe("controlInstance uses tRPC for start/stop/restart", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls trpcVanilla.fleet.controlInstance.mutate for start", async () => {
    mockControlInstance.mockResolvedValueOnce({ ok: true });

    const { controlInstance } = await import("@/lib/api");
    await controlInstance("bot-1", "start");

    expect(mockControlInstance).toHaveBeenCalledWith({ id: "bot-1", action: "start" });
  });

  it("uses tRPC for destroy action", async () => {
    mockControlInstance.mockResolvedValueOnce({ ok: true });

    const { controlInstance } = await import("@/lib/api");
    await controlInstance("bot-1", "destroy");

    expect(mockControlInstance).toHaveBeenCalledWith({ id: "bot-1", action: "destroy" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("getInstanceHealth uses tRPC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls trpcVanilla.fleet.getInstanceHealth.query", async () => {
    mockGetInstanceHealth.mockResolvedValueOnce({
      id: "bot-1",
      state: "running",
      health: "healthy",
      uptime: "2026-02-20T10:00:00Z",
      stats: { cpuPercent: 5, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });

    const { getInstanceHealth } = await import("@/lib/api");
    const result = await getInstanceHealth("bot-1");

    expect(mockGetInstanceHealth).toHaveBeenCalledWith({ id: "bot-1" });
    expect(result.status).toBe("healthy");
    expect(result.uptime).toBeGreaterThan(0);
  });
});

describe("getInstanceLogs uses tRPC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls trpcVanilla.fleet.getInstanceLogs.query", async () => {
    mockGetInstanceLogs.mockResolvedValueOnce({
      logs: [
        "2026-02-20T10:00:00Z [INFO] Bot started",
        "2026-02-20T10:00:01Z [ERROR] Connection failed",
      ],
    });

    const { getInstanceLogs } = await import("@/lib/api");
    const result = await getInstanceLogs("bot-1");

    expect(mockGetInstanceLogs).toHaveBeenCalledWith({ id: "bot-1", tail: 100 });
    expect(result).toHaveLength(2);
    expect(result[0].level).toBe("info");
    expect(result[1].level).toBe("error");
  });
});

describe("getInstanceMetrics uses tRPC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls trpcVanilla.fleet.getInstanceMetrics.query", async () => {
    mockGetInstanceMetrics.mockResolvedValueOnce({
      id: "bot-1",
      stats: { cpuPercent: 5, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });

    const { getInstanceMetrics } = await import("@/lib/api");
    const result = await getInstanceMetrics("bot-1");

    expect(mockGetInstanceMetrics).toHaveBeenCalledWith({ id: "bot-1" });
    expect(result.timeseries).toHaveLength(1);
    expect(result.timeseries[0].memoryMb).toBe(128);
  });
});

describe("getFleetHealth uses tRPC", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls trpcVanilla.fleet.listInstances.query and maps to FleetInstance[]", async () => {
    mockListInstances.mockResolvedValueOnce({
      bots: [
        {
          id: "bot-1",
          name: "test-bot",
          state: "running",
          health: "healthy",
          uptime: "2026-02-20T10:00:00Z",
          startedAt: null,
          stats: null,
        },
      ],
    });

    const { getFleetHealth } = await import("@/lib/api");
    const result = await getFleetHealth();

    expect(mockListInstances).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].health).toBe("healthy");
  });
});
