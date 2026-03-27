import { afterEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  headers: { get: vi.fn().mockReturnValue(null) },
  json: () => Promise.resolve({}),
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

describe("renameInstance", () => {
  afterEach(() => mockFetch.mockClear());

  it("sends PATCH /fleet/bots/:id with name payload", async () => {
    const { renameInstance } = await import("@/lib/api");
    await renameInstance("bot-1", "NewName");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test/fleet/bots/bot-1",
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
        body: JSON.stringify({ name: "NewName" }),
      }),
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: () => Promise.resolve({ error: "Name too short" }),
    });

    const { renameInstance } = await import("@/lib/api");
    await expect(renameInstance("bot-1", "")).rejects.toThrow("Name too short");
  });
});
