import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../lib/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an object with warn and error methods", () => {
    const log = logger("test-ns");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("warn() calls console.warn with namespaced message", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(vi.fn());
    const log = logger("my-module");
    log.warn("something broke");
    expect(spy).toHaveBeenCalledWith("[my-module] something broke");
  });

  it("error() calls console.error with namespaced message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const log = logger("my-module");
    log.error("fatal crash");
    expect(spy).toHaveBeenCalledWith("[my-module] fatal crash");
  });

  it("warn() forwards extra arguments", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(vi.fn());
    const log = logger("ns");
    const extra = { key: "value" };
    log.warn("msg", extra);
    expect(spy).toHaveBeenCalledWith("[ns] msg", extra);
  });

  it("error() forwards an Error object as extra argument", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const log = logger("ns");
    const err = new Error("boom");
    log.error("handler failed", err);
    expect(spy).toHaveBeenCalledWith("[ns] handler failed", err);
  });

  it("different namespaces produce different prefixes", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(vi.fn());
    const logA = logger("alpha");
    const logB = logger("beta");
    logA.warn("hello");
    logB.warn("world");
    expect(spy).toHaveBeenCalledWith("[alpha] hello");
    expect(spy).toHaveBeenCalledWith("[beta] world");
  });
});
