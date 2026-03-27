/**
 * Ollama self-hosted embeddings adapter — embeddings on our own GPU infrastructure.
 *
 * Points at a self-hosted Ollama container running on our internal network.
 * Same ProviderAdapter interface as OpenRouter embeddings, but with:
 * - No API key required (internal container-to-container)
 * - Amortized GPU cost instead of third-party API invoicing
 * - Lower margin (cheaper for users = the standard pricing tier)
 *
 * Uses Ollama's OpenAI-compatible /v1/embeddings endpoint, so it works with
 * any Ollama-hosted embedding model (nomic-embed-text, mxbai-embed-large, etc.).
 *
 * Cost model:
 *   Base cost = total_tokens * costPerToken
 *     Default costPerToken = $0.000000005 (GPU depreciation + electricity)
 *   Charge = base_cost * marginMultiplier (e.g., 1.2 = 20% margin vs 30% for third-party)
 */

import { Credit } from "@wopr-network/platform-core/credits";
import type { FetchFn, SelfHostedAdapterConfig } from "./self-hosted-base.js";
import type { AdapterResult, EmbeddingsInput, EmbeddingsOutput, ProviderAdapter } from "./types.js";
import { withMargin } from "./types.js";

// Re-export FetchFn for tests
export type { FetchFn };

/**
 * Configuration for the Ollama embeddings adapter.
 *
 * Cost precedence: `costPerToken` (if set) > `costPerUnit` (from SelfHostedAdapterConfig).
 * Use `costPerToken` for adapter-specific overrides; `costPerUnit` is the base config
 * shared across all self-hosted adapters.
 */
export interface OllamaEmbeddingsAdapterConfig extends SelfHostedAdapterConfig {
  /** Cost per token in USD (amortized GPU time, default: $0.000000005). Takes precedence over costPerUnit. */
  costPerToken?: number;
  /** Default embedding model (default: "nomic-embed-text") */
  defaultModel?: string;
}

// ~4x cheaper than OpenRouter's text-embedding-3-small ($0.02/1M tokens)
const DEFAULT_COST_PER_TOKEN = 0.000000005; // $0.005 per 1M tokens
const DEFAULT_MARGIN = 1.2; // 20% vs 30% for third-party
const DEFAULT_MODEL = "nomic-embed-text";

/** OpenAI-compatible embeddings response (subset we care about) */
interface OllamaEmbeddingsResponse {
  model: string;
  data: Array<{
    embedding: number[];
  }>;
  usage: {
    total_tokens: number;
  };
}

/**
 * Create an Ollama self-hosted embeddings adapter.
 *
 * Uses factory function pattern (not class) for minimal API surface and easy
 * dependency injection of fetch for testing.
 */
export function createOllamaEmbeddingsAdapter(
  config: OllamaEmbeddingsAdapterConfig,
  fetchFn: FetchFn = fetch,
): ProviderAdapter & Required<Pick<ProviderAdapter, "embed">> {
  const costPerToken = config.costPerToken ?? config.costPerUnit ?? DEFAULT_COST_PER_TOKEN;
  const marginMultiplier = config.marginMultiplier ?? DEFAULT_MARGIN;
  const defaultModel = config.defaultModel ?? DEFAULT_MODEL;
  const timeoutMs = config.timeoutMs ?? 30000;

  return {
    name: "ollama-embeddings",
    capabilities: ["embeddings"] as const,
    selfHosted: true,

    async embed(input: EmbeddingsInput): Promise<AdapterResult<EmbeddingsOutput>> {
      const model = input.model ?? defaultModel;

      const body: Record<string, unknown> = {
        input: input.input,
        model,
      };
      if (input.dimensions !== undefined) {
        body.dimensions = input.dimensions;
      }

      const base = config.baseUrl.replace(/\/+$/, "");
      const res = await fetchFn(`${base}/v1/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama embeddings error (${res.status}): ${text}`);
      }

      const data = (await res.json()) as OllamaEmbeddingsResponse;

      const totalTokens = data.usage?.total_tokens ?? 0;
      const cost = Credit.fromDollars(totalTokens * costPerToken);
      const charge = withMargin(cost, marginMultiplier);

      return {
        result: {
          embeddings: data.data.map((d) => d.embedding),
          model: data.model,
          totalTokens,
        },
        cost,
        charge,
      };
    },
  };
}
