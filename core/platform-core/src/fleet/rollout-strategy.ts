import type { BotProfile } from "./types.js";

export interface IRolloutStrategy {
  /** Select next batch from remaining bots */
  nextBatch(remaining: BotProfile[]): BotProfile[];
  /** Milliseconds to wait between waves */
  pauseDuration(): number;
  /** What to do when a single bot update fails */
  onBotFailure(botId: string, error: Error, attempt: number): "abort" | "skip" | "retry";
  /** Max retries per bot before skip/abort */
  maxRetries(): number;
  /** Health check timeout per bot (ms) */
  healthCheckTimeout(): number;
}

export interface RollingWaveOptions {
  batchPercent?: number;
  pauseMs?: number;
  maxFailures?: number;
}

/**
 * Rolling wave strategy — processes bots in configurable percentage batches.
 * Create a new instance per rollout; totalFailures accumulates across waves
 * within a single rollout. Call reset() if reusing across rollouts.
 */
export class RollingWaveStrategy implements IRolloutStrategy {
  private readonly batchPercent: number;
  private readonly pauseMs: number;
  private readonly maxFailures: number;
  private totalFailures = 0;

  constructor(opts: RollingWaveOptions = {}) {
    this.batchPercent = opts.batchPercent ?? 25;
    this.pauseMs = opts.pauseMs ?? 60_000;
    this.maxFailures = opts.maxFailures ?? 3;
  }

  nextBatch(remaining: BotProfile[]): BotProfile[] {
    if (remaining.length === 0) return [];
    const count = Math.max(1, Math.ceil((remaining.length * this.batchPercent) / 100));
    return remaining.slice(0, count);
  }

  pauseDuration(): number {
    return this.pauseMs;
  }

  onBotFailure(_botId: string, _error: Error, attempt: number): "abort" | "skip" | "retry" {
    if (attempt < this.maxRetries()) return "retry";
    this.totalFailures++;
    if (this.totalFailures >= this.maxFailures) return "abort";
    return "skip";
  }

  maxRetries(): number {
    return 2;
  }

  healthCheckTimeout(): number {
    return 120_000;
  }

  /** Reset failure counters for reuse across rollouts. */
  reset(): void {
    this.totalFailures = 0;
  }
}

export class SingleBotStrategy implements IRolloutStrategy {
  nextBatch(remaining: BotProfile[]): BotProfile[] {
    if (remaining.length === 0) return [];
    return remaining.slice(0, 1);
  }

  pauseDuration(): number {
    return 0;
  }

  onBotFailure(_botId: string, _error: Error, attempt: number): "abort" | "skip" | "retry" {
    if (attempt < this.maxRetries()) return "retry";
    return "abort";
  }

  maxRetries(): number {
    return 3;
  }

  healthCheckTimeout(): number {
    return 120_000;
  }
}

export class ImmediateStrategy implements IRolloutStrategy {
  nextBatch(remaining: BotProfile[]): BotProfile[] {
    return [...remaining];
  }

  pauseDuration(): number {
    return 0;
  }

  onBotFailure(_botId: string, _error: Error, _attempt: number): "abort" | "skip" | "retry" {
    return "skip";
  }

  maxRetries(): number {
    return 1;
  }

  healthCheckTimeout(): number {
    return 60_000;
  }
}

export function createRolloutStrategy(
  type: "rolling-wave" | "single-bot" | "immediate",
  options?: RollingWaveOptions,
): IRolloutStrategy {
  switch (type) {
    case "rolling-wave":
      return new RollingWaveStrategy(options);
    case "single-bot":
      return new SingleBotStrategy();
    case "immediate":
      return new ImmediateStrategy();
  }
}
