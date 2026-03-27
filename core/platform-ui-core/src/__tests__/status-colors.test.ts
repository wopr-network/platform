import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUS_STYLE,
  HEALTH_DOT_STYLES,
  HEALTH_STATUS_STYLES,
  INSTANCE_STATUS_STYLES,
  PLUGIN_STATUS_STYLES,
} from "../lib/status-colors";

describe("INSTANCE_STATUS_STYLES", () => {
  it("maps running to emerald classes", () => {
    expect(INSTANCE_STATUS_STYLES.running).toContain("text-emerald-500");
  });

  it("maps stopped to zinc classes", () => {
    expect(INSTANCE_STATUS_STYLES.stopped).toContain("text-zinc-400");
  });

  it("maps degraded to yellow classes", () => {
    expect(INSTANCE_STATUS_STYLES.degraded).toContain("text-yellow-500");
  });

  it("maps error to red classes", () => {
    expect(INSTANCE_STATUS_STYLES.error).toContain("text-red-500");
  });

  it("has exactly 4 entries", () => {
    expect(Object.keys(INSTANCE_STATUS_STYLES)).toHaveLength(4);
  });
});

describe("HEALTH_STATUS_STYLES", () => {
  it("maps healthy to emerald classes", () => {
    expect(HEALTH_STATUS_STYLES.healthy).toContain("text-emerald-500");
  });

  it("maps degraded to yellow classes", () => {
    expect(HEALTH_STATUS_STYLES.degraded).toContain("text-yellow-500");
  });

  it("maps unhealthy to red classes", () => {
    expect(HEALTH_STATUS_STYLES.unhealthy).toContain("text-red-500");
  });

  it("has exactly 3 entries", () => {
    expect(Object.keys(HEALTH_STATUS_STYLES)).toHaveLength(3);
  });
});

describe("HEALTH_DOT_STYLES", () => {
  it("maps healthy to bg-emerald-500", () => {
    expect(HEALTH_DOT_STYLES.healthy).toBe("bg-emerald-500");
  });

  it("maps degraded to bg-yellow-500", () => {
    expect(HEALTH_DOT_STYLES.degraded).toBe("bg-yellow-500");
  });

  it("maps unhealthy to bg-red-500", () => {
    expect(HEALTH_DOT_STYLES.unhealthy).toBe("bg-red-500");
  });
});

describe("PLUGIN_STATUS_STYLES", () => {
  it("maps active to emerald classes", () => {
    expect(PLUGIN_STATUS_STYLES.active).toContain("text-emerald-500");
  });

  it("maps disabled to zinc classes", () => {
    expect(PLUGIN_STATUS_STYLES.disabled).toContain("text-zinc-400");
  });

  it("returns undefined for unknown plugin status", () => {
    expect(PLUGIN_STATUS_STYLES.nonexistent).toBeUndefined();
  });
});

describe("DEFAULT_STATUS_STYLE", () => {
  it("is a zinc fallback style", () => {
    expect(DEFAULT_STATUS_STYLE).toContain("text-zinc-400");
    expect(DEFAULT_STATUS_STYLE).toContain("bg-zinc-500/15");
  });
});
