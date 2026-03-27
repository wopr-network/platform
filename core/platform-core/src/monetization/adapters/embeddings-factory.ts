/**
 * Embeddings adapter factory — instantiates all available embeddings adapters
 * from environment config and returns them ready to register.
 *
 * Only adapters with valid config are created. The factory never touches
 * the database — it returns plain ProviderAdapter instances that the caller
 * registers with an ArbitrageRouter or AdapterSocket.
 *
 * Priority order (cheapest first, when all adapters available):
 *   Ollama (GPU, cheapest — $0.005/1M tokens amortized)
 *   → OpenRouter ($0.02/1M tokens via text-embedding-3-small)
 */

import { createOllamaEmbeddingsAdapter, type OllamaEmbeddingsAdapterConfig } from "./ollama-embeddings.js";
import { createOpenRouterAdapter, type OpenRouterAdapterConfig } from "./openrouter.js";
import type { ProviderAdapter } from "./types.js";

/** Top-level factory config. Only providers with a key/URL are instantiated. */
export interface EmbeddingsFactoryConfig {
  /** Ollama base URL (e.g., "http://ollama:11434"). Omit or empty string to skip. */
  ollamaBaseUrl?: string;
  /** OpenRouter API key. Omit or empty string to skip. */
  openrouterApiKey?: string;
  /** Per-adapter config overrides */
  ollama?: Omit<Partial<OllamaEmbeddingsAdapterConfig>, "baseUrl">;
  openrouter?: Omit<Partial<OpenRouterAdapterConfig>, "apiKey">;
}

/** Result of the factory — adapters + metadata for observability. */
export interface EmbeddingsFactoryResult {
  /** All instantiated adapters, ordered by cost priority (cheapest first). */
  adapters: ProviderAdapter[];
  /** Map of adapter name → ProviderAdapter for direct registration. */
  adapterMap: Map<string, ProviderAdapter>;
  /** Names of providers that were skipped (missing config). */
  skipped: string[];
}

/**
 * Create embeddings adapters from the provided config.
 *
 * Returns only adapters whose key/URL is present and non-empty.
 * Order matches arbitrage priority: cheapest first.
 */
export function createEmbeddingsAdapters(config: EmbeddingsFactoryConfig): EmbeddingsFactoryResult {
  const adapters: ProviderAdapter[] = [];
  const skipped: string[] = [];

  // Ollama — $0.005/1M tokens (self-hosted GPU, cheapest)
  if (config.ollamaBaseUrl) {
    adapters.push(
      createOllamaEmbeddingsAdapter({
        baseUrl: config.ollamaBaseUrl,
        costPerUnit: 0.000000005,
        ...config.ollama,
      }),
    );
  } else {
    skipped.push("ollama-embeddings");
  }

  // OpenRouter — $0.02/1M tokens (text-embedding-3-small via OpenAI)
  if (config.openrouterApiKey) {
    adapters.push(createOpenRouterAdapter({ ...config.openrouter, apiKey: config.openrouterApiKey }));
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
 * Create embeddings adapters from environment variables.
 *
 * Reads config from:
 *   - OLLAMA_BASE_URL (for self-hosted Ollama embeddings)
 *   - OPENROUTER_API_KEY
 *
 * Accepts optional per-adapter overrides.
 */
export function createEmbeddingsAdaptersFromEnv(
  overrides?: Omit<EmbeddingsFactoryConfig, "ollamaBaseUrl" | "openrouterApiKey">,
): EmbeddingsFactoryResult {
  return createEmbeddingsAdapters({
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    ...overrides,
  });
}
