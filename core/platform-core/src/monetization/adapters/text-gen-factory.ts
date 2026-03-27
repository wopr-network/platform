/**
 * Text-generation adapter factory — instantiates all available text-gen
 * adapters from environment config and returns them ready to register.
 *
 * Only adapters with a non-empty API key are created. The factory never
 * touches the database — it returns plain ProviderAdapter instances that
 * the caller registers with an ArbitrageRouter or AdapterSocket.
 *
 * Priority order (cheapest first):
 *   GPU (self-hosted) → DeepSeek → Gemini → MiniMax → Kimi → OpenRouter
 */

import { createDeepSeekAdapter, type DeepSeekAdapterConfig } from "./deepseek.js";
import { createGeminiAdapter, type GeminiAdapterConfig } from "./gemini.js";
import { createKimiAdapter, type KimiAdapterConfig } from "./kimi.js";
import { createMiniMaxAdapter, type MiniMaxAdapterConfig } from "./minimax.js";
import { createOpenRouterAdapter, type OpenRouterAdapterConfig } from "./openrouter.js";
import type { ProviderAdapter } from "./types.js";

/** Top-level factory config. Only providers with an API key are instantiated. */
export interface TextGenFactoryConfig {
  /** DeepSeek API key. Omit or empty string to skip. */
  deepseekApiKey?: string;
  /** Gemini (Google) API key. Omit or empty string to skip. */
  geminiApiKey?: string;
  /** MiniMax API key. Omit or empty string to skip. */
  minimaxApiKey?: string;
  /** Kimi (Moonshot) API key. Omit or empty string to skip. */
  kimiApiKey?: string;
  /** OpenRouter API key. Omit or empty string to skip. */
  openrouterApiKey?: string;
  /** Per-adapter config overrides (base URL, model, margin, pricing, etc.) */
  deepseek?: Omit<Partial<DeepSeekAdapterConfig>, "apiKey">;
  gemini?: Omit<Partial<GeminiAdapterConfig>, "apiKey">;
  minimax?: Omit<Partial<MiniMaxAdapterConfig>, "apiKey">;
  kimi?: Omit<Partial<KimiAdapterConfig>, "apiKey">;
  openrouter?: Omit<Partial<OpenRouterAdapterConfig>, "apiKey">;
}

/** Result of the factory — adapters + metadata for observability. */
export interface TextGenFactoryResult {
  /** All instantiated adapters, ordered by cost priority (cheapest first). */
  adapters: ProviderAdapter[];
  /** Map of adapter name → ProviderAdapter for direct registration with ArbitrageRouter. */
  adapterMap: Map<string, ProviderAdapter>;
  /** Names of providers that were skipped (no API key). */
  skipped: string[];
}

/**
 * Create text-generation adapters from the provided config.
 *
 * Returns only adapters whose API key is present and non-empty.
 * Order matches arbitrage priority: cheapest first.
 */
export function createTextGenAdapters(config: TextGenFactoryConfig): TextGenFactoryResult {
  const adapters: ProviderAdapter[] = [];
  const skipped: string[] = [];

  // DeepSeek — $0.14/$0.28 per 1M tokens (cheapest hosted)
  if (config.deepseekApiKey) {
    adapters.push(createDeepSeekAdapter({ apiKey: config.deepseekApiKey, ...config.deepseek }));
  } else {
    skipped.push("deepseek");
  }

  // Gemini — $0.10/$0.40 per 1M tokens (cheapest input)
  if (config.geminiApiKey) {
    adapters.push(createGeminiAdapter({ apiKey: config.geminiApiKey, ...config.gemini }));
  } else {
    skipped.push("gemini");
  }

  // MiniMax — $0.255/$1.00 per 1M tokens
  if (config.minimaxApiKey) {
    adapters.push(createMiniMaxAdapter({ apiKey: config.minimaxApiKey, ...config.minimax }));
  } else {
    skipped.push("minimax");
  }

  // Kimi — $0.35/$1.40 per 1M tokens
  if (config.kimiApiKey) {
    adapters.push(createKimiAdapter({ apiKey: config.kimiApiKey, ...config.kimi }));
  } else {
    skipped.push("kimi");
  }

  // OpenRouter — variable pricing, most expensive fallback
  if (config.openrouterApiKey) {
    adapters.push(createOpenRouterAdapter({ apiKey: config.openrouterApiKey, ...config.openrouter }));
  } else {
    skipped.push("openrouter");
  }

  const adapterMap = new Map<string, ProviderAdapter>();
  for (const adapter of adapters) {
    adapterMap.set(adapter.name, adapter);
  }

  return { adapters, adapterMap, skipped };
}

/**
 * Create text-generation adapters from environment variables.
 *
 * Reads API keys from:
 *   - DEEPSEEK_API_KEY
 *   - GEMINI_API_KEY
 *   - MINIMAX_API_KEY
 *   - KIMI_API_KEY
 *   - OPENROUTER_API_KEY
 *
 * Accepts optional per-adapter overrides for pricing, base URL, etc.
 */
export function createTextGenAdaptersFromEnv(
  overrides?: Omit<
    TextGenFactoryConfig,
    "deepseekApiKey" | "geminiApiKey" | "minimaxApiKey" | "kimiApiKey" | "openrouterApiKey"
  >,
): TextGenFactoryResult {
  return createTextGenAdapters({
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    minimaxApiKey: process.env.MINIMAX_API_KEY,
    kimiApiKey: process.env.KIMI_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    ...overrides,
  });
}
