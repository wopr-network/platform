import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    fleet: {
      listInstances: { query: vi.fn() },
      getInstance: {
        query: vi.fn().mockResolvedValue({
          id: "bot-1",
          name: "test-bot",
          state: "running",
          health: null,
          uptime: null,
          createdAt: "2026-01-01T00:00:00Z",
          env: { DISCORD_TOKEN: "tok-123", MODEL: "claude-sonnet" },
          stats: { cpuPercent: 5, memoryUsageMb: 128 },
        }),
      },
      createInstance: { mutate: vi.fn() },
      controlInstance: { mutate: vi.fn() },
      getInstanceHealth: { query: vi.fn() },
      getInstanceLogs: { query: vi.fn() },
      getInstanceMetrics: { query: vi.fn() },
      listTemplates: { query: vi.fn() },
    },
  },
  trpc: {},
}));

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "https://api.test/api",
  PLATFORM_BASE_URL: "https://api.test",
}));

describe("getInstance config population", () => {
  it("populates config from bot env", async () => {
    const { getInstance } = await import("@/lib/api");
    const detail = await getInstance("bot-1");
    expect(detail.config).toEqual({ DISCORD_TOKEN: "tok-123", MODEL: "claude-sonnet" });
  });
});
