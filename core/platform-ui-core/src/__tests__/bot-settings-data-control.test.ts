import { afterEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: () => Promise.resolve({}),
});
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "https://api.test",
  PLATFORM_BASE_URL: "https://api.test",
}));

describe("controlBot HTTP behavior", () => {
  afterEach(() => {
    mockFetch.mockClear();
  });

  it("sends DELETE /fleet/bots/:id for delete action", async () => {
    const { controlBot } = await import("@/lib/bot-settings-data");
    await controlBot("bot-123", "delete");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test/fleet/bots/bot-123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sends POST /fleet/bots/:id/stop for stop action", async () => {
    const { controlBot } = await import("@/lib/bot-settings-data");
    await controlBot("bot-123", "stop");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test/fleet/bots/bot-123/stop",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends POST /fleet/bots/:id/archive for archive action", async () => {
    const { controlBot } = await import("@/lib/bot-settings-data");
    await controlBot("bot-123", "archive");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.test/fleet/bots/bot-123/archive",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
