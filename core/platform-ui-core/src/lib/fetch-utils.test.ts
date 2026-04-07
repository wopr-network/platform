import { afterEach, describe, expect, it, vi } from "vitest";
import { handleUnauthorized, UnauthorizedError } from "./fetch-utils";

function flushPromises() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("UnauthorizedError", () => {
  it("has default message", () => {
    const err = new UnauthorizedError();
    expect(err.message).toBe("Session expired");
    expect(err.name).toBe("UnauthorizedError");
  });

  it("accepts custom message", () => {
    const err = new UnauthorizedError("Token revoked");
    expect(err.message).toBe("Token revoked");
  });

  it("is an instance of Error", () => {
    expect(new UnauthorizedError()).toBeInstanceOf(Error);
  });
});

describe("handleUnauthorized", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("always throws UnauthorizedError", () => {
    expect(() => handleUnauthorized()).toThrow(UnauthorizedError);
  });

  it("sets window.location.href to login URL with callbackUrl after async session check", async () => {
    const mockLocation = {
      pathname: "/dashboard",
      search: "?tab=fleet",
      href: "",
    };
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
      configurable: true,
    });

    // Mock fetch to return expired session
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ session: null }),
      }),
    );

    try {
      handleUnauthorized();
    } catch {
      // expected
    }

    // The redirect happens asynchronously after session check
    await flushPromises();

    expect(mockLocation.href).toBe("/login?reason=expired&callbackUrl=%2Fdashboard%3Ftab%3Dfleet");

    Object.defineProperty(window, "location", {
      value: { pathname: "/", search: "", href: "" },
      writable: true,
      configurable: true,
    });
  });
});
