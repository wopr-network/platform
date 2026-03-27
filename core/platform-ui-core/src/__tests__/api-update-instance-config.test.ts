import { afterEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  headers: { get: vi.fn().mockReturnValue(null) },
  json: () => Promise.resolve({ id: "bot-1", name: "test-bot" }),
});
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    fleet: {
      listInstances: { query: vi.fn() },
      getInstance: { query: vi.fn() },
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

describe("updateInstanceConfig", () => {
  afterEach(() => mockFetch.mockClear());

  it("sends PATCH /fleet/bots/:id with env payload", async () => {
    const { updateInstanceConfig } = await import("@/lib/api");
    await updateInstanceConfig("bot-1", { MODEL: "claude-sonnet", MAX_TOKENS: "4096" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test/fleet/bots/bot-1",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify({ env: { MODEL: "claude-sonnet", MAX_TOKENS: "4096" } }),
      }),
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () => Promise.resolve({ error: "Validation failed" }),
    });

    const { updateInstanceConfig } = await import("@/lib/api");
    await expect(updateInstanceConfig("bot-1", { BAD: "" })).rejects.toThrow("Validation failed");
  });
});
