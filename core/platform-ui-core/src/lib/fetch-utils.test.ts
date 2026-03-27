import { afterEach, describe, expect, it, vi } from "vitest";
import { handleUnauthorized, UnauthorizedError } from "./fetch-utils";

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
  });

  it("always throws UnauthorizedError", () => {
    expect(() => handleUnauthorized()).toThrow(UnauthorizedError);
  });

  it("sets window.location.href to login URL with callbackUrl", () => {
    Object.defineProperty(window, "location", {
      value: {
        pathname: "/dashboard",
        search: "?tab=fleet",
        href: "",
      },
      writable: true,
      configurable: true,
    });

    try {
      handleUnauthorized();
    } catch {
      // expected
    }

    expect(window.location.href).toBe(
      "/login?reason=expired&callbackUrl=%2Fdashboard%3Ftab%3Dfleet",
    );

    Object.defineProperty(window, "location", {
      value: { pathname: "/", search: "", href: "" },
      writable: true,
      configurable: true,
    });
  });
});
