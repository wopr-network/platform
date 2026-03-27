import { afterEach, describe, expect, it, vi } from "vitest";

describe("fleetFetch throws ApiError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("throws ApiError on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      }),
    );

    const { fleetFetch } = await import("./api");
    const { ApiError } = await import("./errors");
    await expect(fleetFetch("/test")).rejects.toBeInstanceOf(ApiError);
    await expect(fleetFetch("/test")).rejects.toMatchObject({ status: 500 });
  });

  it("uses error message from body when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: () => Promise.resolve({ error: "Bot name already taken" }),
      }),
    );

    const { fleetFetch } = await import("./api");
    await expect(fleetFetch("/test")).rejects.toMatchObject({
      status: 422,
      message: "Bot name already taken",
    });
  });
});
