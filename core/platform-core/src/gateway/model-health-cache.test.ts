import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelHealthCache } from "./model-health-cache.js";

describe("ModelHealthCache", () => {
  let cache: ModelHealthCache;
  const TTL = 300_000; // 5 minutes

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ModelHealthCache(TTL);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports all models healthy by default", () => {
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(true);
  });

  it("marks a model on cooldown", () => {
    cache.markUnhealthy("qwen/qwen3.6-plus:free");
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(false);
  });

  it("model becomes healthy again after TTL expires", () => {
    cache.markUnhealthy("qwen/qwen3.6-plus:free");
    vi.advanceTimersByTime(TTL + 1);
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(true);
  });

  it("model stays unhealthy before TTL expires", () => {
    cache.markUnhealthy("qwen/qwen3.6-plus:free");
    vi.advanceTimersByTime(TTL - 1000);
    expect(cache.isHealthy("qwen/qwen3.6-plus:free")).toBe(false);
  });

  it("firstHealthyModel returns first non-cooldown model", () => {
    const models = ["model-a", "model-b", "model-c"];
    cache.markUnhealthy("model-a");
    expect(cache.firstHealthyModel(models)).toBe("model-b");
  });

  it("firstHealthyModel returns last model when all on cooldown (best-effort)", () => {
    const models = ["model-a", "model-b", "model-c"];
    cache.markUnhealthy("model-a");
    cache.markUnhealthy("model-b");
    cache.markUnhealthy("model-c");
    expect(cache.firstHealthyModel(models)).toBe("model-c");
  });

  it("firstHealthyModel returns first model when list has one entry", () => {
    expect(cache.firstHealthyModel(["only-model"])).toBe("only-model");
  });
});
