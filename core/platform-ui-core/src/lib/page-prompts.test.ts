import { describe, expect, it } from "vitest";
import { getPagePrompt, PAGE_PROMPTS } from "./page-prompts";

describe("getPagePrompt", () => {
  it("returns exact match for known route", () => {
    const result = getPagePrompt("/dashboard");
    expect(result).toBe(PAGE_PROMPTS["/dashboard"]);
  });

  it("returns null for unknown route", () => {
    const result = getPagePrompt("/nonexistent");
    expect(result).toBeNull();
  });

  it("falls back to prefix match for dynamic routes", () => {
    const result = getPagePrompt("/instances/abc-123");
    expect(result).toBe(PAGE_PROMPTS["/instances"]);
  });

  it("returns null for empty string", () => {
    const result = getPagePrompt("");
    expect(result).toBeNull();
  });

  it("has prompts for all major routes", () => {
    const requiredRoutes = ["/dashboard", "/marketplace", "/instances"];
    for (const route of requiredRoutes) {
      expect(typeof PAGE_PROMPTS[route]).toBe("string");
      expect(PAGE_PROMPTS[route].length).toBeGreaterThan(0);
    }
  });
});
