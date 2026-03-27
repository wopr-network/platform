import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "https://api.test/api",
  PLATFORM_BASE_URL: "https://api.test",
}));

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

  it("handleUnauthorized redirects to /login with reason and callbackUrl", async () => {
    const { handleUnauthorized } = await import("@/lib/fetch-utils");
    expect(() => handleUnauthorized()).toThrow("Session expired");
    expect(mockLocation.href).toBe("/login?reason=expired&callbackUrl=%2Fdashboard");
  });

  it("UnauthorizedError has correct name and message", async () => {
    const { UnauthorizedError } = await import("@/lib/fetch-utils");
    const err = new UnauthorizedError();
    expect(err.name).toBe("UnauthorizedError");
    expect(err.message).toBe("Session expired");
  });

  it("apiFetch redirects on 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    const { getProfile } = await import("@/lib/api");
    await expect(getProfile()).rejects.toThrow("Session expired");
    expect(mockLocation.href).toContain("/login?reason=expired");
  });

  it("fleetFetch redirects on 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    const { listInstances } = await import("@/lib/api");
    await expect(listInstances()).rejects.toThrow("Session expired");
    expect(mockLocation.href).toContain("/login?reason=expired");
  });

  it("trpcFetch redirects on 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    const { getCurrentPlan } = await import("@/lib/api");
    await expect(getCurrentPlan()).rejects.toThrow("Session expired");
    expect(mockLocation.href).toContain("/login?reason=expired");
  });

  it("non-401 errors still throw generic message from apiFetch", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });
    const { getProfile } = await import("@/lib/api");
    await expect(getProfile()).rejects.toThrow("API error: 500 Internal Server Error");
    expect(mockLocation.href).toBe("");
  });

  it("bot-settings-data apiFetch redirects on 401", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized" });
    const { getBotSettings } = await import("@/lib/bot-settings-data");
    await expect(getBotSettings("bot-1")).rejects.toThrow("Session expired");
    expect(mockLocation.href).toContain("/login?reason=expired");
  });
});
