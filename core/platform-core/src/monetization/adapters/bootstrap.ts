/**
 * Unified adapter bootstrap — instantiates ALL capability-specific adapter
 * factories from a single config and returns every adapter ready to register.
 *
 * This is the top-level entry point for standing up the full arbitrage stack.
 * Call `bootstrapAdapters(config)` (or `bootstrapAdaptersFromEnv()`) once at
 * startup, then register the returned adapters with an ArbitrageRouter or
 * AdapterSocket.
 *
 * Capabilities wired:
 *   - text-generation (DeepSeek, Gemini, MiniMax, Kimi, OpenRouter)
 *   - tts (Chatterbox GPU, ElevenLabs)
 *   - transcription (Deepgram)
 *   - embeddings (Ollama GPU, OpenRouter)
 *   - image-generation (Replicate, Nano Banana)
 */

import { createEmbeddingsAdapters, type EmbeddingsFactoryConfig } from "./embeddings-factory.js";
import { createImageGenAdapters, type ImageGenFactoryConfig } from "./image-gen-factory.js";
import { createTextGenAdapters, type TextGenFactoryConfig } from "./text-gen-factory.js";
import { createTranscriptionAdapters, type TranscriptionFactoryConfig } from "./transcription-factory.js";
import { createTTSAdapters, type TTSFactoryConfig } from "./tts-factory.js";
import type { ProviderAdapter } from "./types.js";

/** Combined config for all adapter factories. */
export interface BootstrapConfig {
  /** Text-generation adapter config */
  textGen?: TextGenFactoryConfig;
  /** TTS adapter config */
  tts?: TTSFactoryConfig;
  /** Transcription adapter config */
  transcription?: TranscriptionFactoryConfig;
  /** Embeddings adapter config */
  embeddings?: EmbeddingsFactoryConfig;
  /** Image generation adapter config */
  imageGen?: ImageGenFactoryConfig;
}

/** Result of bootstrapping all adapters. */
export interface BootstrapResult {
  /**
   * All instantiated adapters across all capabilities, ordered by capability then cost.
   * Register these with an ArbitrageRouter or AdapterSocket.
   *
   * NOTE: The same provider may appear multiple times if it serves multiple
   * capabilities (e.g. OpenRouter for both text-gen and embeddings). Each
   * instance is independently configured. Use the per-capability factory
   * results if you need a name→adapter map within a single capability.
   *
   * NOTE: Some adapters advertise more capabilities than the factory that
   * created them (e.g. Replicate advertises text-generation and transcription
   * in addition to image-generation). The ArbitrageRouter should use the
   * factory-assigned capability (reflected in byCapability), not the adapter's
   * own capabilities array, for routing decisions.
   */
  adapters: ProviderAdapter[];
  /** Names of providers that were skipped (missing config), grouped by capability. */
  skipped: Record<string, string[]>;
  /** Summary counts for observability. */
  summary: {
    total: number;
    skipped: number;
    byCapability: Record<string, number>;
  };
}

/**
 * Bootstrap all adapter factories from the provided config.
 *
 * Instantiates every capability factory and merges the results into a
 * single unified result. Only adapters with valid config are created.
 */
export function bootstrapAdapters(config: BootstrapConfig): BootstrapResult {
  const textGen = createTextGenAdapters(config.textGen ?? {});
  const tts = createTTSAdapters(config.tts ?? {});
  const transcription = createTranscriptionAdapters(config.transcription ?? {});
  const embeddings = createEmbeddingsAdapters(config.embeddings ?? {});
  const imageGen = createImageGenAdapters(config.imageGen ?? {});

  const adapters: ProviderAdapter[] = [
    ...textGen.adapters,
    ...tts.adapters,
    ...transcription.adapters,
    ...embeddings.adapters,
    ...imageGen.adapters,
  ];

  const skipped: Record<string, string[]> = {};
  if (textGen.skipped.length > 0) skipped["text-generation"] = textGen.skipped;
  if (tts.skipped.length > 0) skipped.tts = tts.skipped;
  if (transcription.skipped.length > 0) skipped.transcription = transcription.skipped;
  if (embeddings.skipped.length > 0) skipped.embeddings = embeddings.skipped;
  if (imageGen.skipped.length > 0) skipped["image-generation"] = imageGen.skipped;

  let totalSkipped = 0;
  for (const list of Object.values(skipped)) {
    totalSkipped += list.length;
  }

  return {
    adapters,
    skipped,
    summary: {
      total: adapters.length,
      skipped: totalSkipped,
      byCapability: {
        "text-generation": textGen.adapters.length,
        tts: tts.adapters.length,
        transcription: transcription.adapters.length,
        embeddings: embeddings.adapters.length,
        "image-generation": imageGen.adapters.length,
      },
    },
  };
}

/**
 * Bootstrap all adapter factories from environment variables.
 *
 * Reads API keys from:
 *   - DEEPSEEK_API_KEY, GEMINI_API_KEY, MINIMAX_API_KEY, KIMI_API_KEY, OPENROUTER_API_KEY (text-gen)
 *   - CHATTERBOX_BASE_URL, ELEVENLABS_API_KEY (TTS)
 *   - DEEPGRAM_API_KEY (transcription)
 *   - OLLAMA_BASE_URL, OPENROUTER_API_KEY (embeddings)
 *   - REPLICATE_API_TOKEN, NANO_BANANA_API_KEY (image-gen)
 *
 * Accepts optional per-capability config overrides.
 */
export function bootstrapAdaptersFromEnv(overrides?: Partial<BootstrapConfig>): BootstrapResult {
  return bootstrapAdapters({
    textGen: {
      deepseekApiKey: process.env.DEEPSEEK_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
      minimaxApiKey: process.env.MINIMAX_API_KEY,
      kimiApiKey: process.env.KIMI_API_KEY,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      ...overrides?.textGen,
    },
    tts: {
      chatterboxBaseUrl: process.env.CHATTERBOX_BASE_URL,
      elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
      ...overrides?.tts,
    },
    transcription: {
      deepgramApiKey: process.env.DEEPGRAM_API_KEY,
      ...overrides?.transcription,
    },
    embeddings: {
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      openrouterApiKey: process.env.OPENROUTER_API_KEY,
      ...overrides?.embeddings,
    },
    imageGen: {
      replicateApiToken: process.env.REPLICATE_API_TOKEN,
      // Separate env var from GEMINI_API_KEY (used for text-gen) to avoid
      // silently enabling image-gen when only text-gen is intended.
      geminiApiKey: process.env.NANO_BANANA_API_KEY,
      ...overrides?.imageGen,
    },
  });
}
