import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch-utils so handleUnauthorized doesn't redirect
vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(() => {
    throw new Error("Unauthorized");
  }),
  UnauthorizedError: class extends Error {},
}));

// Mock api-config
vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://test-api:3001/api",
  PLATFORM_BASE_URL: "http://test-api:3001/api",
}));

import {
  activateSuperpower,
  controlBot,
  disconnectChannel,
  getBotSettings,
  getChannelConfig,
  getPluginConfig,
  getResourceTier,
  getStorageTier,
  getStorageUsage,
  getSuperpowerConfig,
  installPlugin,
  setResourceTier,
  setStorageTier,
  togglePlugin,
  updateBotBrain,
  updateBotIdentity,
  updateChannelConfig,
  updatePluginConfig,
  updateSuperpowerConfig,
} from "@/lib/bot-settings-data";
import { handleUnauthorized } from "@/lib/fetch-utils";

function mockFetchResponse(body: unknown, status = 200, statusText = "OK") {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  });
}

describe("bot-settings-data API functions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetchResponse({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("getBotSettings", () => {
    it("fetches bot settings with correct URL and credentials", async () => {
      const mockSettings = { id: "bot-1", identity: { name: "TestBot" } };
      vi.stubGlobal("fetch", mockFetchResponse(mockSettings));

      const result = await getBotSettings("bot-1");

      expect(result).toEqual(mockSettings);
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/settings",
        expect.objectContaining({
          credentials: "include",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        }),
      );
    });

    it("throws on 401 after calling handleUnauthorized", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: () => Promise.resolve({}),
        }),
      );

      await expect(getBotSettings("bot-1")).rejects.toThrow("Unauthorized");
      expect(handleUnauthorized).toHaveBeenCalled();
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

      await expect(getBotSettings("bot-1")).rejects.toThrow("API error: 500 Internal Server Error");
    });
  });

  describe("updateBotIdentity", () => {
    it("sends PUT with identity payload", async () => {
      const identity = { name: "NewName", avatar: "cat", personality: "Friendly" };
      vi.stubGlobal("fetch", mockFetchResponse(identity));

      const result = await updateBotIdentity("bot-1", identity);

      expect(result).toEqual(identity);
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/identity",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(identity),
        }),
      );
    });
  });

  describe("activateSuperpower", () => {
    it("sends POST to activate endpoint", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({ success: true }));

      const result = await activateSuperpower("bot-1", "voice");

      expect(result).toEqual({ success: true });
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/capabilities/voice/activate",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("controlBot", () => {
    it("sends DELETE for delete action", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));

      await controlBot("bot-1", "delete");

      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("sends POST to /{action} for stop", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));

      await controlBot("bot-1", "stop");

      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/stop",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("sends POST to /{action} for archive", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));

      await controlBot("bot-1", "archive");

      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/archive",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("updateBotBrain", () => {
    it("sends PATCH with env vars for model change", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));

      await updateBotBrain("bot-1", { model: "gpt-4", provider: "openai", mode: "byok" });

      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            env: {
              PLATFORM_LLM_MODEL: "gpt-4",
              PLATFORM_LLM_PROVIDER: "openai",
              PLATFORM_LLM_MODE: "byok",
            },
          }),
        }),
      );
    });

    it("omits undefined env vars", async () => {
      const mockFn = mockFetchResponse({});
      vi.stubGlobal("fetch", mockFn);

      await updateBotBrain("bot-1", { model: "claude-4" });

      const callBody = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(callBody.env).toEqual({ PLATFORM_LLM_MODEL: "claude-4" });
      expect(callBody.env.PLATFORM_LLM_PROVIDER).toBeUndefined();
    });
  });

  describe("getStorageUsage", () => {
    it("returns usage data on success", async () => {
      const usage = { usedBytes: 100, totalBytes: 1000, availableBytes: 900 };
      vi.stubGlobal("fetch", mockFetchResponse(usage));

      const result = await getStorageUsage("bot-1");
      expect(result).toEqual(usage);
    });

    it("returns null on error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Error",
          json: () => Promise.resolve({}),
        }),
      );

      const result = await getStorageUsage("bot-1");
      expect(result).toBeNull();
    });
  });

  describe("storage and resource tier operations", () => {
    it("getStorageTier fetches correct endpoint", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({ tier: "standard" }));
      const result = await getStorageTier("bot-1");
      expect(result).toEqual({ tier: "standard" });
    });

    it("setStorageTier sends PUT with tier", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({ tier: "premium" }));
      await setStorageTier("bot-1", "premium");
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/storage-tier",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ tier: "premium" }),
        }),
      );
    });

    it("getResourceTier fetches correct endpoint", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({ tier: "basic" }));
      const result = await getResourceTier("bot-1");
      expect(result).toEqual({ tier: "basic" });
    });

    it("setResourceTier sends PUT and returns result", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({ tier: "pro", dailyCostCents: 50 }));
      const result = await setResourceTier("bot-1", "pro");
      expect(result).toEqual({ tier: "pro", dailyCostCents: 50 });
    });
  });

  describe("channel operations", () => {
    it("disconnectChannel sends DELETE", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));
      await disconnectChannel("bot-1", "ch-1");
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/channels/ch-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("getChannelConfig fetches config", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({ token: "abc" }));
      const result = await getChannelConfig("bot-1", "ch-1");
      expect(result).toEqual({ token: "abc" });
    });

    it("updateChannelConfig sends PUT with config", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));
      await updateChannelConfig("bot-1", "ch-1", { token: "new" });
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/channels/ch-1/config",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ token: "new" }),
        }),
      );
    });
  });

  describe("plugin operations", () => {
    it("togglePlugin sends PATCH with enabled state", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));
      await togglePlugin("bot-1", "plug-1", false);
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/plugins/plug-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ enabled: false }),
        }),
      );
    });

    it("installPlugin sends POST", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));
      await installPlugin("bot-1", "plug-1");
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/plugins/plug-1",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("getPluginConfig fetches config", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({ key: "val" }));
      const result = await getPluginConfig("bot-1", "plug-1");
      expect(result).toEqual({ key: "val" });
    });

    it("updatePluginConfig sends PUT", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));
      await updatePluginConfig("bot-1", "plug-1", { key: "new" });
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/plugins/plug-1/config",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ key: "new" }),
        }),
      );
    });
  });

  describe("superpower operations", () => {
    it("getSuperpowerConfig fetches config", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({ model: "sdxl" }));
      const result = await getSuperpowerConfig("bot-1", "image-gen");
      expect(result).toEqual({ model: "sdxl" });
    });

    it("updateSuperpowerConfig sends PUT", async () => {
      vi.stubGlobal("fetch", mockFetchResponse({}));
      await updateSuperpowerConfig("bot-1", "image-gen", { model: "dall-e" });
      expect(fetch).toHaveBeenCalledWith(
        "http://test-api:3001/api/fleet/bots/bot-1/capabilities/image-gen/config",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ model: "dall-e" }),
        }),
      );
    });
  });
});
