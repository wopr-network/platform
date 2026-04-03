/**
 * In-memory cooldown cache for model health.
 *
 * When a model returns 404/429/5xx/timeout, it's marked unhealthy
 * for a configurable TTL. The gateway skips unhealthy models when
 * walking the product's model priority list.
 */

/** Default cooldown: 5 minutes. */
export const DEFAULT_MODEL_COOLDOWN_MS = 300_000;

export class ModelHealthCache {
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly ttlMs: number = DEFAULT_MODEL_COOLDOWN_MS) {}

  /** Mark a model as unhealthy. It will be skipped until the TTL expires. */
  markUnhealthy(modelId: string): void {
    this.cooldowns.set(modelId, Date.now() + this.ttlMs);
  }

  /** Check if a model is healthy (not on cooldown). */
  isHealthy(modelId: string): boolean {
    const expiry = this.cooldowns.get(modelId);
    if (expiry === undefined) return true;
    if (Date.now() > expiry) {
      this.cooldowns.delete(modelId);
      return true;
    }
    return false;
  }

  /**
   * Return the first healthy model from the priority list.
   * If ALL models are on cooldown, returns the last model (best-effort).
   */
  firstHealthyModel(models: string[]): string {
    for (const model of models) {
      if (this.isHealthy(model)) return model;
    }
    return models[models.length - 1];
  }
}
