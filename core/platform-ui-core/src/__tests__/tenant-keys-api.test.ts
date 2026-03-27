import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the fetch at the module level
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Must mock api-config before importing api
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

import { deleteTenantKey, getTenantKey, listTenantKeys, storeTenantKey } from "@/lib/api";

describe("tenant-keys API", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("listTenantKeys calls GET /api/tenant-keys", async () => {
    const mockData = [
      { provider: "openai", hasKey: true, maskedKey: "sk-...ab", createdAt: null, updatedAt: null },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await listTenantKeys();
    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/tenant-keys",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("getTenantKey calls GET /api/tenant-keys/:provider", async () => {
    const mockData = {
      provider: "openai",
      hasKey: true,
      maskedKey: "sk-...ab",
      createdAt: null,
      updatedAt: null,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await getTenantKey("openai");
    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/tenant-keys/openai",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("storeTenantKey calls PUT /api/tenant-keys/:provider with key", async () => {
    const mockData = {
      provider: "openai",
      hasKey: true,
      maskedKey: "sk-...ab",
      createdAt: null,
      updatedAt: null,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    });

    const result = await storeTenantKey("openai", "sk-real-key");
    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/tenant-keys/openai",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ key: "sk-real-key" }),
      }),
    );
  });

  it("deleteTenantKey calls DELETE /api/tenant-keys/:provider", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.resolve({}),
    });

    await deleteTenantKey("openai");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/tenant-keys/openai",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
