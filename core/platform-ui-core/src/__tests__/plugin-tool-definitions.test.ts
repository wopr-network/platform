import { describe, expect, it } from "vitest";
import { getPlatformUIToolDefinitions } from "../lib/plugin/tool-definitions";

describe("getPlatformUIToolDefinitions()", () => {
  it("exports an array of tool definitions", () => {
    expect(Array.isArray(getPlatformUIToolDefinitions())).toBe(true);
    expect(getPlatformUIToolDefinitions().length).toBeGreaterThan(0);
  });

  it("every definition has name, description, and inputSchema", () => {
    for (const def of getPlatformUIToolDefinitions()) {
      expect(typeof def.name).toBe("string");
      expect(typeof def.description).toBe("string");
      expect(typeof def.inputSchema).toBe("object");
    }
  });

  it("does not include handler functions (definitions only)", () => {
    for (const def of getPlatformUIToolDefinitions()) {
      expect(def).not.toHaveProperty("handler");
    }
  });

  it("includes expected fleet tools", () => {
    const names = getPlatformUIToolDefinitions().map((d) => d.name);
    expect(names).toContain("platform_list_instances");
    expect(names).toContain("platform_create_instance");
    expect(names).toContain("platform_control_instance");
  });

  it("includes expected marketplace tools", () => {
    const names = getPlatformUIToolDefinitions().map((d) => d.name);
    expect(names).toContain("marketplace.showSuperpowers");
    expect(names).toContain("marketplace.highlightCard");
    expect(names).toContain("marketplace.openDetail");
  });

  it("includes expected onboarding tools", () => {
    const names = getPlatformUIToolDefinitions().map((d) => d.name);
    expect(names).toContain("onboarding.beginSetup");
    expect(names).toContain("onboarding.markComplete");
    expect(names).toContain("onboarding.showPricing");
  });

  it("includes expected chat tools", () => {
    const names = getPlatformUIToolDefinitions().map((d) => d.name);
    expect(names).toContain("chat_expand");
    expect(names).toContain("chat_collapse");
    expect(names).toContain("chat_fullscreen");
  });
});
