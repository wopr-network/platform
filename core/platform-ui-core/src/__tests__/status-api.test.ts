import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlatformHealthResponse } from "../lib/api";

const MOCK_HEALTH: PlatformHealthResponse = {
  status: "healthy",
  services: [
    { name: "database", status: "healthy", latencyMs: 2 },
    { name: "redis", status: "healthy", latencyMs: 1 },
  ],
  version: "1.0.0",
  uptime: 86400,
};

describe("fetchPlatformHealth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns health data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_HEALTH),
      }),
    );
    const { fetchPlatformHealth } = await import("../lib/api");
    const result = await fetchPlatformHealth();
    expect(result).toEqual(MOCK_HEALTH);
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const { fetchPlatformHealth } = await import("../lib/api");
    const result = await fetchPlatformHealth();
    expect(result).toBeNull();
  });

  it("returns null on non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { fetchPlatformHealth } = await import("../lib/api");
    const result = await fetchPlatformHealth();
    expect(result).toBeNull();
  });
});
