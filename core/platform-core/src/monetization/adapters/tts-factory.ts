/**
 * TTS adapter factory — instantiates all available TTS adapters from
 * environment config and returns them ready to register.
 *
 * Only adapters with valid config are created. The factory never touches
 * the database — it returns plain ProviderAdapter instances that the caller
 * registers with an ArbitrageRouter or AdapterSocket.
 *
 * Priority order (cheapest first):
 *   GPU (chatterbox-tts, self-hosted) → ElevenLabs (third-party)
 */

import { type ChatterboxTTSAdapterConfig, createChatterboxTTSAdapter } from "./chatterbox-tts.js";
import { createElevenLabsAdapter, type ElevenLabsAdapterConfig } from "./elevenlabs.js";
import type { ProviderAdapter } from "./types.js";

/** Top-level factory config. Chatterbox needs a base URL; ElevenLabs needs an API key. */
export interface TTSFactoryConfig {
  /** Chatterbox GPU container base URL (e.g., "http://chatterbox:8000"). Omit to skip. */
  chatterboxBaseUrl?: string;
  /** ElevenLabs API key. Omit or empty string to skip. */
  elevenlabsApiKey?: string;
  /** Per-adapter config overrides */
  chatterbox?: Omit<Partial<ChatterboxTTSAdapterConfig>, "baseUrl">;
  elevenlabs?: Omit<Partial<ElevenLabsAdapterConfig>, "apiKey">;
}

/** Result of the factory — adapters + metadata for observability. */
export interface TTSFactoryResult {
  /** All instantiated adapters, ordered by cost priority (cheapest first). */
  adapters: ProviderAdapter[];
  /** Map of adapter name → ProviderAdapter for direct registration. */
  adapterMap: Map<string, ProviderAdapter>;
  /** Names of providers that were skipped (missing config). */
  skipped: string[];
}

/**
 * Create TTS adapters from the provided config.
 *
 * Returns only adapters whose required config is present.
 * Order matches arbitrage priority: GPU (cheapest) first.
 */
export function createTTSAdapters(config: TTSFactoryConfig): TTSFactoryResult {
  const adapters: ProviderAdapter[] = [];
  const skipped: string[] = [];

  // Chatterbox — self-hosted GPU, $2.00/1M chars wholesale, $2.40/1M effective (cheapest)
  if (config.chatterboxBaseUrl) {
    adapters.push(
      createChatterboxTTSAdapter({
        baseUrl: config.chatterboxBaseUrl,
        costPerUnit: 0.000002,
        ...config.chatterbox,
      }),
    );
  } else {
    skipped.push("chatterbox-tts");
  }

  // ElevenLabs — third-party, ~$15/1M chars (premium)
  if (config.elevenlabsApiKey) {
    adapters.push(createElevenLabsAdapter({ apiKey: config.elevenlabsApiKey, ...config.elevenlabs }));
  } else {
    skipped.push("elevenlabs");
  }

  const adapterMap = new Map<string, ProviderAdapter>();
  for (const adapter of adapters) {
    adapterMap.set(adapter.name, adapter);
  }

  return { adapters, adapterMap, skipped };
}

/**
 * Create TTS adapters from environment variables.
 *
 * Reads config from:
 *   - CHATTERBOX_BASE_URL
 *   - ELEVENLABS_API_KEY
 *
 * Accepts optional per-adapter overrides.
 */
export function createTTSAdaptersFromEnv(
  overrides?: Omit<TTSFactoryConfig, "chatterboxBaseUrl" | "elevenlabsApiKey">,
): TTSFactoryResult {
  return createTTSAdapters({
    chatterboxBaseUrl: process.env.CHATTERBOX_BASE_URL,
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    ...overrides,
  });
}
