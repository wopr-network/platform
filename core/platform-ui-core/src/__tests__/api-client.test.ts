import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "https://test-api.local/api",
  PLATFORM_BASE_URL: "https://test-api.local",
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {},
}));

const mockHandleUnauthorized = vi.fn(() => {
  throw new Error("Session expired");
});

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: mockHandleUnauthorized,
  UnauthorizedError: class extends Error {
    name = "UnauthorizedError";
  },
}));

const mockGetActiveTenantId = vi.fn(() => "");

vi.mock("@/lib/tenant-context", () => ({
  getActiveTenantId: mockGetActiveTenantId,
}));

describe("apiFetch (via getProfile)", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockHandleUnauthorized.mockClear();
    mockGetActiveTenantId.mockReturnValue("");
    vi.resetModules();
  });

  afterEach(() => {
    mockFetch.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on 200", async () => {
    const profile = { id: "u1", name: "Alice", email: "alice@test.com" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(profile),
    });

    const { getProfile } = await import("@/lib/api");
    const result = await getProfile();
    expect(result).toEqual(profile);
  });

  it("sends Content-Type application/json", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const { getProfile } = await import("@/lib/api");
    await getProfile();

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends credentials: include", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const { getProfile } = await import("@/lib/api");
    await getProfile();

    const [, init] = mockFetch.mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  it("includes x-tenant-id header when tenant is active", async () => {
    mockGetActiveTenantId.mockReturnValue("tenant-abc");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const { getProfile } = await import("@/lib/api");
    await getProfile();

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["x-tenant-id"]).toBe("tenant-abc");
  });

  it("omits x-tenant-id header when tenant is empty", async () => {
    mockGetActiveTenantId.mockReturnValue("");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const { getProfile } = await import("@/lib/api");
    await getProfile();

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["x-tenant-id"]).toBeUndefined();
  });

  it("calls correct URL with API_BASE_URL prefix", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const { getProfile } = await import("@/lib/api");
    await getProfile();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://test-api.local/api/settings/profile",
      expect.any(Object),
    );
  });

  it("throws on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { getProfile } = await import("@/lib/api");
    await expect(getProfile()).rejects.toThrow("Failed to fetch");
  });

  it("calls handleUnauthorized on 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const { getProfile } = await import("@/lib/api");
    await expect(getProfile()).rejects.toThrow("Session expired");
    expect(mockHandleUnauthorized).toHaveBeenCalledOnce();
  });

  it("throws with status code on 403", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: () => Promise.resolve({}),
    });

    const { getProfile } = await import("@/lib/api");
    await expect(getProfile()).rejects.toThrow("API error: 403 Forbidden");
  });

  it("throws with status code on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({}),
    });

    const { getProfile } = await import("@/lib/api");
    await expect(getProfile()).rejects.toThrow("API error: 404 Not Found");
  });

  it("throws with status code on 500", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });

    const { getProfile } = await import("@/lib/api");
    await expect(getProfile()).rejects.toThrow("API error: 500 Internal Server Error");
  });
});

describe("fleetFetch", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockHandleUnauthorized.mockClear();
    mockGetActiveTenantId.mockReturnValue("");
    vi.resetModules();
  });

  afterEach(() => {
    mockFetch.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on 200", async () => {
    const payload = { bots: [{ id: "b1", name: "Bot" }] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: () => Promise.resolve(payload),
    });

    const { fleetFetch } = await import("@/lib/api");
    const result = await fleetFetch("/bots");
    expect(result).toEqual(payload);
  });

  it("calls correct URL with PLATFORM_BASE_URL/fleet prefix", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: () => Promise.resolve({}),
    });

    const { fleetFetch } = await import("@/lib/api");
    await fleetFetch("/bots");

    expect(mockFetch).toHaveBeenCalledWith("https://test-api.local/fleet/bots", expect.any(Object));
  });

  it("includes x-tenant-id header when tenant is active", async () => {
    mockGetActiveTenantId.mockReturnValue("org-xyz");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: () => Promise.resolve({}),
    });

    const { fleetFetch } = await import("@/lib/api");
    await fleetFetch("/bots");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["x-tenant-id"]).toBe("org-xyz");
  });

  it("sends credentials: include", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: vi.fn().mockReturnValue(null) },
      json: () => Promise.resolve({}),
    });

    const { fleetFetch } = await import("@/lib/api");
    await fleetFetch("/bots");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  it("calls handleUnauthorized on 401", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: () => Promise.resolve({}),
    });

    const { fleetFetch } = await import("@/lib/api");
    await expect(fleetFetch("/bots")).rejects.toThrow("Session expired");
    expect(mockHandleUnauthorized).toHaveBeenCalledOnce();
  });

  it("throws error body message on non-2xx when JSON has error field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: () => Promise.resolve({ error: "Bot name already exists" }),
    });

    const { fleetFetch } = await import("@/lib/api");
    await expect(fleetFetch("/bots")).rejects.toThrow("Bot name already exists");
  });

  it("falls back to status text when error JSON parse fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("not json")),
    });

    const { fleetFetch } = await import("@/lib/api");
    await expect(fleetFetch("/bots")).rejects.toThrow("API error: 500 Internal Server Error");
  });

  it("falls back to status text when error JSON has no error field", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: () => Promise.resolve({ detail: "overloaded" }),
    });

    const { fleetFetch } = await import("@/lib/api");
    await expect(fleetFetch("/bots")).rejects.toThrow("API error: 503 Service Unavailable");
  });

  it("throws on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const { fleetFetch } = await import("@/lib/api");
    await expect(fleetFetch("/bots")).rejects.toThrow("Failed to fetch");
  });
});
