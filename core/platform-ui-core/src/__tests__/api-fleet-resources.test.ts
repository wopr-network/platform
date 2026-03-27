import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock api-config before importing api.ts
vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://test:3001/api",
  PLATFORM_BASE_URL: "http://test:3001",
}));

describe("getFleetResources", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("calls /api/fleet/resources with credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ totalCpuPercent: 42, totalMemoryMb: 512, memoryCapacityMb: 1024 }),
    });

    const { getFleetResources } = await import("@/lib/api");
    const result = await getFleetResources();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://test:3001/api/fleet/resources",
      expect.objectContaining({
        credentials: "include",
      }),
    );
    expect(result).toEqual({
      totalCpuPercent: 42,
      totalMemoryMb: 512,
      memoryCapacityMb: 1024,
    });
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });

    const { getFleetResources } = await import("@/lib/api");
    await expect(getFleetResources()).rejects.toThrow("API error: 500");
  });
});
