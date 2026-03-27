/**
 * Image generation adapter factory — instantiates all available image-gen
 * adapters from environment config and returns them ready to register.
 *
 * Only adapters with valid config are created. The factory never touches
 * the database — it returns plain ProviderAdapter instances that the caller
 * registers with an ArbitrageRouter or AdapterSocket.
 *
 * Priority order (cheapest first, when all adapters available):
 *   self-hosted-sdxl (GPU, cheapest — not yet implemented)
 *   → Replicate (~$0.019/image, SDXL on A40)
 *   → Nano Banana / Gemini ($0.02/image)
 */

import { createNanoBananaAdapter, type NanoBananaAdapterConfig } from "./nano-banana.js";
import { createReplicateAdapter, type ReplicateAdapterConfig } from "./replicate.js";
import type { ProviderAdapter } from "./types.js";

/** Top-level factory config. Only providers with an API key/token are instantiated. */
export interface ImageGenFactoryConfig {
  /** Gemini API key (for Nano Banana image generation). Omit or empty string to skip. */
  geminiApiKey?: string;
  /** Replicate API token. Omit or empty string to skip. */
  replicateApiToken?: string;
  /** Per-adapter config overrides */
  nanoBanana?: Omit<Partial<NanoBananaAdapterConfig>, "apiKey">;
  replicate?: Omit<Partial<ReplicateAdapterConfig>, "apiToken">;
}

/** Result of the factory — adapters + metadata for observability. */
export interface ImageGenFactoryResult {
  /** All instantiated adapters, ordered by cost priority (cheapest first). */
  adapters: ProviderAdapter[];
  /** Map of adapter name → ProviderAdapter for direct registration. */
  adapterMap: Map<string, ProviderAdapter>;
  /** Names of providers that were skipped (missing config). */
  skipped: string[];
}

/**
 * Create image generation adapters from the provided config.
 *
 * Returns only adapters whose API key/token is present and non-empty.
 * Order matches arbitrage priority: cheapest first.
 */
export function createImageGenAdapters(config: ImageGenFactoryConfig): ImageGenFactoryResult {
  const adapters: ProviderAdapter[] = [];
  const skipped: string[] = [];

  // Replicate — ~$0.019/image SDXL (cheapest)
  if (config.replicateApiToken) {
    adapters.push(createReplicateAdapter({ apiToken: config.replicateApiToken, ...config.replicate }));
  } else {
    skipped.push("replicate");
  }

  // Nano Banana (Gemini) — $0.02/image (slightly more expensive fallback)
  if (config.geminiApiKey) {
    adapters.push(createNanoBananaAdapter({ apiKey: config.geminiApiKey, ...config.nanoBanana }));
  } else {
    skipped.push("nano-banana");
  }

  const adapterMap = new Map<string, ProviderAdapter>();
  for (const adapter of adapters) {
    adapterMap.set(adapter.name, adapter);
  }

  return { adapters, adapterMap, skipped };
}

/**
 * Create image generation adapters from environment variables.
 *
 * Reads config from:
 *   - GEMINI_API_KEY (for Nano Banana)
 *   - REPLICATE_API_TOKEN
 *
 * Accepts optional per-adapter overrides.
 */
export function createImageGenAdaptersFromEnv(
  overrides?: Omit<ImageGenFactoryConfig, "geminiApiKey" | "replicateApiToken">,
): ImageGenFactoryResult {
  return createImageGenAdapters({
    geminiApiKey: process.env.GEMINI_API_KEY,
    replicateApiToken: process.env.REPLICATE_API_TOKEN,
    ...overrides,
  });
}
