import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://localhost:3001/api",
  PLATFORM_BASE_URL: "http://localhost:3001",
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(() => {
    throw new Error("Unauthorized");
  }),
  UnauthorizedError: class extends Error {
    constructor(msg = "Session expired") {
      super(msg);
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {},
}));

import { removeProviderKey, saveProviderKey } from "@/lib/api";

describe("saveProviderKey tenant-key integration", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls PUT /api/tenant-keys/:provider before posting to providers", async () => {
    const tenantKeyResponse = {
      provider: "anthropic",
      hasKey: true,
      maskedKey: "sk-ant-...xy",
      createdAt: null,
      updatedAt: null,
    };
    const providerKeyResponse = {
      id: "pk-new",
      provider: "anthropic",
      maskedKey: "sk-ant-...xy",
      status: "valid",
      lastChecked: null,
      defaultModel: null,
      models: [],
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(tenantKeyResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(providerKeyResponse),
      });

    await saveProviderKey("anthropic", "sk-ant-real-key");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/tenant-keys/anthropic",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ key: "sk-ant-real-key" }) }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/settings/providers",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("removeProviderKey tenant-key integration", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls DELETE /api/tenant-keys/:provider before deleting from providers", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      });

    await removeProviderKey("pk-1", "anthropic");

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/tenant-keys/anthropic",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/settings/providers/pk-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("still deletes from providers even if tenant-key delete fails", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      });

    await removeProviderKey("pk-missing", "anthropic");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith(
      "http://localhost:3001/api/settings/providers/pk-missing",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
