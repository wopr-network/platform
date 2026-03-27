import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isWebMCPAvailable } from "../lib/webmcp/feature-detect";

describe("isWebMCPAvailable", () => {
  let originalModelContext: ModelContext | undefined;

  beforeEach(() => {
    originalModelContext = navigator.modelContext;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "modelContext", {
      value: originalModelContext,
      writable: true,
      configurable: true,
    });
  });

  it("returns false when navigator.modelContext is undefined", () => {
    Object.defineProperty(navigator, "modelContext", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(isWebMCPAvailable()).toBe(false);
  });

  it("returns false when registerTool is not a function", () => {
    Object.defineProperty(navigator, "modelContext", {
      value: { registerTool: "not-a-function" },
      writable: true,
      configurable: true,
    });
    expect(isWebMCPAvailable()).toBe(false);
  });

  it("returns true when navigator.modelContext.registerTool is a function", () => {
    Object.defineProperty(navigator, "modelContext", {
      value: { registerTool: vi.fn() },
      writable: true,
      configurable: true,
    });
    expect(isWebMCPAvailable()).toBe(true);
  });

  it("returns false when modelContext exists but registerTool is not a function", () => {
    Object.defineProperty(navigator, "modelContext", {
      value: { registerTool: null },
      writable: true,
      configurable: true,
    });
    expect(isWebMCPAvailable()).toBe(false);
  });
});
