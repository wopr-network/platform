import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "https://api.test/api",
  PLATFORM_BASE_URL: "https://api.test",
}));

/**
 * Helper: wait for all pending microtasks/promises to flush.
 * handleUnauthorized fires an async session check internally;
 * we need to let that settle before asserting on mockLocation.href.
 */
function flushPromises() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("401 redirect handling", () => {
  const mockLocation = { href: "", pathname: "/dashboard", search: "" };
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockLocation.href = "";
    mockLocation.pathname = "/dashboard";
    mockLocation.search = "";
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("window", { location: mockLocation });
    vi.resetModules();
  });

  afterEach(() => {
    mockFetch.mockReset();
    vi.unstubAllGlobals();
  });

  it("handleUnauthorized throws UnauthorizedError and redirects when session is expired", async () => {
    // Mock the internal session check to return no session (expired)
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ session: null }),
    });
    const { handleUnauthorized } = await import("@/lib/fetch-utils");
    expect(() => handleUnauthorized()).toThrow("Session expired");
    // Wait for the async session check to complete and trigger redirect
    await flushPromises();
    expect(mockLocation.href).toBe("/login?reason=expired&callbackUrl=%2Fdashboard");
  });

  it("UnauthorizedError has correct name and message", async () => {
    const { UnauthorizedError } = await import("@/lib/fetch-utils");
    const err = new UnauthorizedError();
    expect(err.name).toBe("UnauthorizedError");
    expect(err.message).toBe("Session expired");
  });

  it("apiFetch redirects on 401", async () => {
    // First call: the API request itself returns 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    // Second call: the internal session check returns expired
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ session: null }),
    });
    const { getProfile } = await import("@/lib/api");
    await expect(getProfile()).rejects.toThrow("Session expired");
    await flushPromises();
    expect(mockLocation.href).toContain("/login?reason=expired");
  });

  it("fleetFetch (updateInstanceConfig) redirects on 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ session: null }),
    });
    const { updateInstanceConfig } = await import("@/lib/api");
    await expect(updateInstanceConfig("bot-1", {})).rejects.toThrow("Session expired");
    await flushPromises();
    expect(mockLocation.href).toContain("/login?reason=expired");
  });

  it("apiFetch (listProviderKeys) redirects on 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ session: null }),
    });
    const { listProviderKeys } = await import("@/lib/api");
    await expect(listProviderKeys()).rejects.toThrow("Session expired");
    await flushPromises();
    expect(mockLocation.href).toContain("/login?reason=expired");
  });

  it("non-401 errors still throw without redirecting", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });
    const { getProfile } = await import("@/lib/api");
    // getProfile uses tRPC, so the error message comes from tRPC internals
    await expect(getProfile()).rejects.toThrow();
    // The key assertion: non-401 errors must NOT redirect to /login
    expect(mockLocation.href).toBe("");
  });

  it("bot-settings-data apiFetch redirects on 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ session: null }),
    });
    const { getBotSettings } = await import("@/lib/bot-settings-data");
    await expect(getBotSettings("bot-1")).rejects.toThrow("Session expired");
    await flushPromises();
    expect(mockLocation.href).toContain("/login?reason=expired");
  });
});
