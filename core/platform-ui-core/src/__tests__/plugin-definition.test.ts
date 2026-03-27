import { describe, expect, it } from "vitest";
import plugin from "../lib/plugin";

describe("platform-ui plugin", () => {
  it("has the correct name", () => {
    expect(plugin.name).toBe("platform-ui");
  });

  it("has a version string", () => {
    expect(typeof plugin.version).toBe("string");
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has a description", () => {
    expect(typeof plugin.description).toBe("string");
    expect((plugin.description ?? "").length).toBeGreaterThan(0);
  });

  it("has an init function", () => {
    expect(typeof plugin.init).toBe("function");
  });

  it("init is a no-op (returns without error)", async () => {
    await expect(plugin.init?.({} as never)).resolves.toBeUndefined();
  });

  it("has a shutdown function", () => {
    expect(typeof plugin.shutdown).toBe("function");
  });

  it("shutdown is a no-op", async () => {
    await expect(plugin.shutdown?.()).resolves.toBeUndefined();
  });

  it("has no commands (browser-only plugin)", () => {
    expect(plugin.commands ?? []).toEqual([]);
  });

  it("exports toolDefinitions for external consumption", async () => {
    const { getPlatformUIToolDefinitions } = await import("../lib/plugin/tool-definitions");
    expect(getPlatformUIToolDefinitions().length).toBeGreaterThan(0);
  });
});
