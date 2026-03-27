import { afterEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted so mock fns are available inside vi.mock factory (which gets hoisted)
const { mockListInstances, mockGetInstance, mockCreateInstance, mockControlInstance } = vi.hoisted(
  () => ({
    mockListInstances: vi.fn(),
    mockGetInstance: vi.fn(),
    mockCreateInstance: vi.fn(),
    mockControlInstance: vi.fn(),
  }),
);

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    fleet: {
      listInstances: { query: mockListInstances },
      getInstance: { query: mockGetInstance },
      createInstance: { mutate: mockCreateInstance },
      controlInstance: { mutate: mockControlInstance },
      getInstanceHealth: { query: vi.fn() },
      getInstanceLogs: { query: vi.fn() },
      getInstanceMetrics: { query: vi.fn() },
      listTemplates: { query: vi.fn() },
    },
    billing: {
      creditsBalance: { query: vi.fn() },
      creditsHistory: { query: vi.fn() },
      creditOptions: { query: vi.fn() },
      affiliateStats: { query: vi.fn() },
      affiliateReferrals: { query: vi.fn() },
      usageSummary: { query: vi.fn() },
      currentPlan: { query: vi.fn() },
      providerCosts: { query: vi.fn() },
      billingInfo: { query: vi.fn() },
      creditsCheckout: { mutate: vi.fn() },
      inferenceMode: { query: vi.fn() },
      hostedUsageSummary: { query: vi.fn() },
      hostedUsageEvents: { query: vi.fn() },
      updateBillingEmail: { mutate: vi.fn() },
      removePaymentMethod: { mutate: vi.fn() },
      setDefaultPaymentMethod: { mutate: vi.fn() },
      portalSession: { mutate: vi.fn() },
      spendingLimits: { query: vi.fn() },
      updateSpendingLimits: { mutate: vi.fn() },
      cryptoCheckout: { mutate: vi.fn() },
      autoTopupSettings: { query: vi.fn() },
      updateAutoTopupSettings: { mutate: vi.fn() },
    },
  },
  trpc: {},
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(() => {
    throw new Error("Unauthorized");
  }),
  UnauthorizedError: class extends Error {},
}));

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://test-api:3001/api",
  PLATFORM_BASE_URL: "http://test-api:3001",
}));

vi.mock("@/lib/tenant-context", () => ({
  getActiveTenantId: vi.fn(() => "tenant-123"),
}));

import {
  controlInstance,
  createInstance,
  deployInstance,
  getInstance,
  listInstances,
} from "@/lib/api";

describe("listInstances", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapped instances from tRPC response", async () => {
    mockListInstances.mockResolvedValue({
      bots: [
        {
          id: "bot-1",
          name: "TestBot",
          state: "running",
          health: "healthy",
          uptime: null,
          startedAt: null,
          createdAt: "2026-01-01T00:00:00Z",
          env: { PLATFORM_PLUGINS_CHANNELS: "discord,slack" },
          stats: null,
        },
      ],
    });

    const result = await listInstances();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("bot-1");
    expect(result[0].name).toBe("TestBot");
    expect(result[0].status).toBe("running");
    expect(result[0].channels).toEqual(["discord", "slack"]);
  });

  it("maps bot state dead to error", async () => {
    mockListInstances.mockResolvedValue({
      bots: [
        {
          id: "1",
          name: "A",
          state: "dead",
          health: null,
          uptime: null,
          startedAt: null,
          createdAt: "2026-01-01T00:00:00Z",
          stats: null,
        },
      ],
    });

    const result = await listInstances();
    expect(result[0].status).toBe("error");
  });

  it("maps bot state exited to stopped", async () => {
    mockListInstances.mockResolvedValue({
      bots: [
        {
          id: "1",
          name: "A",
          state: "exited",
          health: null,
          uptime: null,
          startedAt: null,
          createdAt: "2026-01-01T00:00:00Z",
          stats: null,
        },
      ],
    });

    const result = await listInstances();
    expect(result[0].status).toBe("stopped");
  });

  it("parses plugins from PLATFORM_PLUGINS_OTHER env var", async () => {
    mockListInstances.mockResolvedValue({
      bots: [
        {
          id: "1",
          name: "Bot",
          state: "running",
          health: null,
          uptime: null,
          startedAt: null,
          createdAt: "2026-01-01T00:00:00Z",
          env: {
            PLATFORM_PLUGINS_OTHER: "plugin-a,plugin-b",
          },
          stats: null,
        },
      ],
    });

    const result = await listInstances();
    expect(result[0].plugins.map((p) => p.id)).toEqual(["plugin-a", "plugin-b"]);
  });

  it("parses plugins from multiple env vars", async () => {
    mockListInstances.mockResolvedValue({
      bots: [
        {
          id: "1",
          name: "Bot",
          state: "running",
          health: null,
          uptime: null,
          startedAt: null,
          createdAt: "2026-01-01T00:00:00Z",
          env: {
            PLATFORM_PLUGINS_OTHER: "plugin-a,plugin-b",
            PLATFORM_PLUGINS_VOICE: "voice-plugin",
            PLATFORM_PLUGINS_PROVIDERS: "provider-a",
          },
          stats: null,
        },
      ],
    });

    const result = await listInstances();
    expect(result[0].plugins).toHaveLength(4);
  });
});

describe("getInstance", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns mapped instance detail with resource usage", async () => {
    mockGetInstance.mockResolvedValue({
      id: "bot-1",
      name: "TestBot",
      state: "running",
      health: "healthy",
      uptime: null,
      startedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      env: { KEY: "val" },
      stats: { cpuPercent: 5, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });

    const result = await getInstance("bot-1");
    expect(result.id).toBe("bot-1");
    expect(result.config).toEqual({ KEY: "val" });
    expect(result.resourceUsage.memoryMb).toBe(128);
    expect(result.resourceUsage.cpuPercent).toBe(5);
  });

  it("returns zero resource usage when stats is null", async () => {
    mockGetInstance.mockResolvedValue({
      id: "bot-1",
      name: "TestBot",
      state: "stopped",
      health: null,
      uptime: null,
      startedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      env: {},
      stats: null,
    });

    const result = await getInstance("bot-1");
    expect(result.resourceUsage.memoryMb).toBe(0);
    expect(result.resourceUsage.cpuPercent).toBe(0);
  });
});

describe("createInstance", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls tRPC mutate and returns mapped instance", async () => {
    mockCreateInstance.mockResolvedValue({
      id: "new-bot",
      name: "NewBot",
    });

    const result = await createInstance({
      name: "NewBot",
      template: "default",
      provider: "anthropic",
      channels: ["discord"],
      plugins: ["voice"],
    });

    expect(result.id).toBe("new-bot");
    expect(result.name).toBe("NewBot");
    expect(result.status).toBe("stopped");
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].id).toBe("voice");
  });

  it("passes all create params to tRPC", async () => {
    mockCreateInstance.mockResolvedValue({ id: "bot-x", name: "BotX" });

    await createInstance({
      name: "BotX",
      template: "custom",
      provider: "openai",
      channels: ["slack"],
      plugins: ["a", "b"],
    });

    expect(mockCreateInstance).toHaveBeenCalledWith({
      name: "BotX",
      image: "ghcr.io/wopr-network/wopr:latest",
      template: "custom",
      provider: "openai",
      channels: ["slack"],
      plugins: ["a", "b"],
    });
  });
});

describe("deployInstance", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("deploys with default stable image", async () => {
    mockCreateInstance.mockResolvedValue({
      id: "deployed-1",
      name: "DeployedBot",
    });

    const result = await deployInstance({ name: "DeployedBot", description: "Test bot" });

    expect(mockCreateInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "DeployedBot",
        image: "ghcr.io/wopr-network/wopr:stable",
        description: "Test bot",
      }),
    );
    expect(result.id).toBe("deployed-1");
    expect(result.status).toBe("stopped");
  });

  it("passes env vars to tRPC", async () => {
    mockCreateInstance.mockResolvedValue({ id: "bot-2", name: "EnvBot" });

    await deployInstance({ name: "EnvBot", env: { FOO: "bar" } });

    expect(mockCreateInstance).toHaveBeenCalledWith(
      expect.objectContaining({ env: { FOO: "bar" } }),
    );
  });

  it("defaults description to empty string", async () => {
    mockCreateInstance.mockResolvedValue({ id: "bot-3", name: "NoDesc" });

    await deployInstance({ name: "NoDesc" });

    expect(mockCreateInstance).toHaveBeenCalledWith(expect.objectContaining({ description: "" }));
  });
});

describe("controlInstance", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls tRPC mutate with stop action", async () => {
    mockControlInstance.mockResolvedValue({});
    await controlInstance("bot-1", "stop");
    expect(mockControlInstance).toHaveBeenCalledWith({ id: "bot-1", action: "stop" });
  });

  it("calls tRPC mutate with start action", async () => {
    mockControlInstance.mockResolvedValue({});
    await controlInstance("bot-1", "start");
    expect(mockControlInstance).toHaveBeenCalledWith({ id: "bot-1", action: "start" });
  });

  it("calls tRPC mutate with destroy action", async () => {
    mockControlInstance.mockResolvedValue({});
    await controlInstance("bot-1", "destroy");
    expect(mockControlInstance).toHaveBeenCalledWith({ id: "bot-1", action: "destroy" });
  });
});

describe("pollChannelQr error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws on 500 with status text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      }),
    );

    const { pollChannelQr } = await import("@/lib/api");
    await expect(pollChannelQr("bot-1")).rejects.toThrow("API error: 500 Internal Server Error");
  });

  it("returns QR response on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ qrPng: "data:image/png;base64,abc", status: "pending" }),
      }),
    );

    const { pollChannelQr } = await import("@/lib/api");
    const result = await pollChannelQr("bot-1");
    expect(result.status).toBe("pending");
    expect(result.qrPng).toBe("data:image/png;base64,abc");
  });
});
