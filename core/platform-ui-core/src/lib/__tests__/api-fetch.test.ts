import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://localhost:3001/api",
  PLATFORM_BASE_URL: "http://localhost:3001",
}));

const { mockGetActiveTenantId, mockHandleUnauthorized } = vi.hoisted(() => ({
  mockGetActiveTenantId: vi.fn().mockReturnValue(""),
  mockHandleUnauthorized: vi.fn(),
}));

vi.mock("@/lib/tenant-context", () => ({
  getActiveTenantId: mockGetActiveTenantId,
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: mockHandleUnauthorized,
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor(message = "Session expired") {
      super(message);
      this.name = "UnauthorizedError";
    }
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {},
}));

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    mockGetActiveTenantId.mockReturnValue("");
    mockHandleUnauthorized.mockReset();
  });

  it("sends credentials: include and Content-Type header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/lib/api");
    await apiFetch("/v1/test");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toBe("http://localhost:3001/api/v1/test");
    expect(init.credentials).toBe("include");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("attaches x-tenant-id header when tenant is active", async () => {
    mockGetActiveTenantId.mockReturnValue("tenant-abc");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/lib/api");
    await apiFetch("/v1/bots");

    const [, init] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(init.headers["x-tenant-id"]).toBe("tenant-abc");
  });

  it("omits x-tenant-id header when no tenant is active", async () => {
    mockGetActiveTenantId.mockReturnValue("");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/lib/api");
    await apiFetch("/v1/bots");

    const [, init] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(init.headers["x-tenant-id"]).toBeUndefined();
  });

  it("calls handleUnauthorized on 401 response", async () => {
    mockHandleUnauthorized.mockImplementation(() => {
      const err = new Error("Session expired");
      err.name = "UnauthorizedError";
      throw err;
    });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/lib/api");
    await expect(apiFetch("/v1/me")).rejects.toMatchObject({ name: "UnauthorizedError" });
    expect(mockHandleUnauthorized).toHaveBeenCalledOnce();
  });

  it("throws ApiError with status and statusText on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/lib/api");
    const { ApiError } = await import("@/lib/errors");

    const promise = apiFetch("/v1/fail");
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 500,
      statusText: "Internal Server Error",
    });
  });

  it("uses error message from response body when present", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: () => Promise.resolve({ error: "Bot name already taken" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/lib/api");
    await expect(apiFetch("/v1/bots")).rejects.toMatchObject({
      status: 422,
      message: "Bot name already taken",
    });
  });

  it("forwards custom headers and method from init param", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/lib/api");
    await apiFetch("/v1/bots", {
      method: "POST",
      headers: { "X-Custom": "value" },
      body: JSON.stringify({ name: "test" }),
    });

    const [, init] = mockFetch.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(init.method).toBe("POST");
    expect(init.headers["X-Custom"]).toBe("value");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.credentials).toBe("include");
  });

  it("returns parsed JSON body on successful response", async () => {
    const payload = { id: "bot-1", name: "TestBot" };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { apiFetch } = await import("@/lib/api");
    const result = await apiFetch<{ id: string; name: string }>("/v1/bots/bot-1");
    expect(result).toEqual(payload);
  });
});
