/**
 * Transcription adapter factory — instantiates all available STT adapters
 * from environment config and returns them ready to register.
 *
 * Only adapters with valid config are created. The factory never touches
 * the database — it returns plain ProviderAdapter instances that the caller
 * registers with an ArbitrageRouter or AdapterSocket.
 *
 * Priority order (cheapest first, when all adapters available):
 *   self-hosted-whisper (GPU, cheapest) → Deepgram ($0.0043/min, third-party)
 *
 * NOTE: Self-hosted Whisper adapter doesn't exist yet. When it does, it
 * will slot in as the GPU tier (cheapest) ahead of Deepgram.
 */

import { createDeepgramAdapter, type DeepgramAdapterConfig } from "./deepgram.js";
import type { ProviderAdapter } from "./types.js";

/** Top-level factory config. Only providers with an API key are instantiated. */
export interface TranscriptionFactoryConfig {
  /** Deepgram API key. Omit or empty string to skip. */
  deepgramApiKey?: string;
  /** Per-adapter config overrides */
  deepgram?: Omit<Partial<DeepgramAdapterConfig>, "apiKey">;
}

/** Result of the factory — adapters + metadata for observability. */
export interface TranscriptionFactoryResult {
  /** All instantiated adapters, ordered by cost priority (cheapest first). */
  adapters: ProviderAdapter[];
  /** Map of adapter name → ProviderAdapter for direct registration. */
  adapterMap: Map<string, ProviderAdapter>;
  /** Names of providers that were skipped (no API key). */
  skipped: string[];
}

/**
 * Create transcription adapters from the provided config.
 *
 * Returns only adapters whose API key is present and non-empty.
 * Order matches arbitrage priority: cheapest first.
 */
export function createTranscriptionAdapters(config: TranscriptionFactoryConfig): TranscriptionFactoryResult {
  const adapters: ProviderAdapter[] = [];
  const skipped: string[] = [];

  // Deepgram — $0.0043/min (Nova-2 wholesale)
  if (config.deepgramApiKey) {
    adapters.push(createDeepgramAdapter({ apiKey: config.deepgramApiKey, ...config.deepgram }));
  } else {
    skipped.push("deepgram");
  }

  // Future: self-hosted-whisper will go BEFORE deepgram (GPU tier, cheapest)

  const adapterMap = new Map<string, ProviderAdapter>();
  for (const adapter of adapters) {
    adapterMap.set(adapter.name, adapter);
  }

  return { adapters, adapterMap, skipped };
}

/**
 * Create transcription adapters from environment variables.
 *
 * Reads API keys from:
 *   - DEEPGRAM_API_KEY
 *
 * Accepts optional per-adapter overrides.
 */
export function createTranscriptionAdaptersFromEnv(
  overrides?: Omit<TranscriptionFactoryConfig, "deepgramApiKey">,
): TranscriptionFactoryResult {
  return createTranscriptionAdapters({
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    ...overrides,
  });
}
