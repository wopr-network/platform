import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createRolloutStrategy,
  ImmediateStrategy,
  RollingWaveStrategy,
  SingleBotStrategy,
} from "../rollout-strategy.js";
import type { BotProfile } from "../types.js";

function makeBots(count: number): BotProfile[] {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    tenantId: "tenant-1",
    name: `bot-${i}`,
    description: "",
    image: "ghcr.io/wopr-network/test:latest",
    env: {},
    restartPolicy: "unless-stopped" as const,
    releaseChannel: "stable" as const,
    updatePolicy: "manual" as const,
  }));
}

describe("RollingWaveStrategy", () => {
  it("returns batchPercent of remaining bots", () => {
    const s = new RollingWaveStrategy({ batchPercent: 25 });
    const bots = makeBots(10);
    const batch = s.nextBatch(bots);
    // 25% of 10 = 2.5, ceil = 3
    expect(batch).toHaveLength(3);
    expect(batch).toEqual(bots.slice(0, 3));
  });

  it("returns minimum 1 bot even with low percentage", () => {
    const s = new RollingWaveStrategy({ batchPercent: 1 });
    const bots = makeBots(2);
    expect(s.nextBatch(bots)).toHaveLength(1);
  });

  it("returns empty array for empty remaining", () => {
    const s = new RollingWaveStrategy();
    expect(s.nextBatch([])).toHaveLength(0);
  });

  it("handles 1 bot remaining", () => {
    const s = new RollingWaveStrategy({ batchPercent: 50 });
    const bots = makeBots(1);
    expect(s.nextBatch(bots)).toHaveLength(1);
  });

  it("handles batchPercent > 100", () => {
    const s = new RollingWaveStrategy({ batchPercent: 200 });
    const bots = makeBots(5);
    // 200% of 5 = 10, ceil = 10, but slice(0,10) on 5 items = 5
    expect(s.nextBatch(bots)).toHaveLength(5);
  });

  it("returns correct pause duration", () => {
    expect(new RollingWaveStrategy().pauseDuration()).toBe(60_000);
    expect(new RollingWaveStrategy({ pauseMs: 30_000 }).pauseDuration()).toBe(30_000);
  });

  it("retries on failure until maxRetries", () => {
    const s = new RollingWaveStrategy({ maxFailures: 2 });
    const err = new Error("fail");
    expect(s.onBotFailure("b1", err, 0)).toBe("retry");
    expect(s.onBotFailure("b1", err, 1)).toBe("retry");
  });

  it("skips after maxRetries when under maxFailures", () => {
    const s = new RollingWaveStrategy({ maxFailures: 3 });
    const err = new Error("fail");
    // attempt >= maxRetries (2), first total failure
    expect(s.onBotFailure("b1", err, 2)).toBe("skip");
  });

  it("aborts when total failures reach maxFailures", () => {
    const s = new RollingWaveStrategy({ maxFailures: 2 });
    const err = new Error("fail");
    // exhaust retries for bot1 → skip (totalFailures=1)
    expect(s.onBotFailure("b1", err, 2)).toBe("skip");
    // exhaust retries for bot2 → abort (totalFailures=2 >= maxFailures=2)
    expect(s.onBotFailure("b2", err, 2)).toBe("abort");
  });

  it("has maxRetries of 2", () => {
    expect(new RollingWaveStrategy().maxRetries()).toBe(2);
  });

  it("has healthCheckTimeout of 120_000", () => {
    expect(new RollingWaveStrategy().healthCheckTimeout()).toBe(120_000);
  });
});

describe("SingleBotStrategy", () => {
  it("returns exactly 1 bot", () => {
    const s = new SingleBotStrategy();
    const bots = makeBots(10);
    expect(s.nextBatch(bots)).toHaveLength(1);
    expect(s.nextBatch(bots)[0]).toBe(bots[0]);
  });

  it("returns empty for empty remaining", () => {
    expect(new SingleBotStrategy().nextBatch([])).toHaveLength(0);
  });

  it("has pauseDuration of 0", () => {
    expect(new SingleBotStrategy().pauseDuration()).toBe(0);
  });

  it("always retries on failure", () => {
    const s = new SingleBotStrategy();
    const err = new Error("fail");
    expect(s.onBotFailure("b1", err, 0)).toBe("retry");
    expect(s.onBotFailure("b1", err, 1)).toBe("retry");
    expect(s.onBotFailure("b1", err, 2)).toBe("retry");
    // After maxRetries (3), aborts instead of retrying forever
    expect(s.onBotFailure("b1", err, 99)).toBe("abort");
  });

  it("has maxRetries of 3", () => {
    expect(new SingleBotStrategy().maxRetries()).toBe(3);
  });

  it("has healthCheckTimeout of 120_000", () => {
    expect(new SingleBotStrategy().healthCheckTimeout()).toBe(120_000);
  });
});

describe("ImmediateStrategy", () => {
  it("returns all remaining bots", () => {
    const s = new ImmediateStrategy();
    const bots = makeBots(10);
    expect(s.nextBatch(bots)).toHaveLength(10);
    expect(s.nextBatch(bots)).toEqual(bots);
  });

  it("returns empty for empty remaining", () => {
    expect(new ImmediateStrategy().nextBatch([])).toHaveLength(0);
  });

  it("does not mutate the input array", () => {
    const s = new ImmediateStrategy();
    const bots = makeBots(3);
    const result = s.nextBatch(bots);
    expect(result).not.toBe(bots);
    expect(result).toEqual(bots);
  });

  it("has pauseDuration of 0", () => {
    expect(new ImmediateStrategy().pauseDuration()).toBe(0);
  });

  it("always skips on failure", () => {
    const s = new ImmediateStrategy();
    const err = new Error("fail");
    expect(s.onBotFailure("b1", err, 0)).toBe("skip");
    expect(s.onBotFailure("b1", err, 5)).toBe("skip");
  });

  it("has maxRetries of 1", () => {
    expect(new ImmediateStrategy().maxRetries()).toBe(1);
  });

  it("has healthCheckTimeout of 60_000", () => {
    expect(new ImmediateStrategy().healthCheckTimeout()).toBe(60_000);
  });
});

describe("createRolloutStrategy", () => {
  it("creates RollingWaveStrategy", () => {
    const s = createRolloutStrategy("rolling-wave");
    expect(s).toBeInstanceOf(RollingWaveStrategy);
  });

  it("creates RollingWaveStrategy with options", () => {
    const s = createRolloutStrategy("rolling-wave", { batchPercent: 50, pauseMs: 10_000 });
    expect(s).toBeInstanceOf(RollingWaveStrategy);
    expect(s.pauseDuration()).toBe(10_000);
  });

  it("creates SingleBotStrategy", () => {
    const s = createRolloutStrategy("single-bot");
    expect(s).toBeInstanceOf(SingleBotStrategy);
  });

  it("creates ImmediateStrategy", () => {
    const s = createRolloutStrategy("immediate");
    expect(s).toBeInstanceOf(ImmediateStrategy);
  });
});
