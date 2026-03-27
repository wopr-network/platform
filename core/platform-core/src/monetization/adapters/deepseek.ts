/**
 * DeepSeek hosted adapter -- text generation via DeepSeek's OpenAI-compatible API.
 *
 * DeepSeek V3.2 offers frontier-class quality at $0.14/$0.28 per 1M tokens,
 * making it the highest-margin provider for text generation arbitrage.
 * Bypasses OpenRouter entirely — no 5.5% credit fee.
 *
 * Cost is calculated from the usage object returned by the chat completions
 * API (prompt_tokens + completion_tokens) using configured per-model rates.
 * DeepSeek also supports prompt caching — cached input tokens are 90% cheaper.
 */

import { Credit } from "@wopr-network/platform-core/credits";
import type { AdapterResult, ProviderAdapter, TextGenerationInput, TextGenerationOutput } from "./types.js";
import { withMargin } from "./types.js";

/** Configuration for the DeepSeek adapter */
export interface DeepSeekAdapterConfig {
  /** DeepSeek API key */
  apiKey: string;
  /** DeepSeek API base URL (default: https://api.deepseek.com) */
  baseUrl?: string;
  /** Default model (default: "deepseek-chat") */
  defaultModel?: string;
  /** Cost per 1M input tokens in USD (default: $0.14) */
  inputTokenCostPer1M?: number;
  /** Cost per 1M output tokens in USD (default: $0.28) */
  outputTokenCostPer1M?: number;
  /** Cost per 1M cached input tokens in USD (default: $0.014) */
  cachedInputTokenCostPer1M?: number;
  /** Margin multiplier (default: 1.3) */
  marginMultiplier?: number;
}

/**
 * A function that performs an HTTP fetch. Accepts the same signature as
 * the global `fetch`. This indirection lets tests inject a stub without
 * mocking globals.
 */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** OpenAI-compatible chat completion response with DeepSeek extensions */
interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    /** DeepSeek returns cached token counts when prompt caching is active */
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_MARGIN = 1.3;
// DeepSeek V3.2 pricing (March 2026)
const DEFAULT_INPUT_COST_PER_1M = 0.14; // $0.14 per 1M input tokens
const DEFAULT_OUTPUT_COST_PER_1M = 0.28; // $0.28 per 1M output tokens
const DEFAULT_CACHED_INPUT_COST_PER_1M = 0.014; // $0.014 per 1M cached input tokens (90% discount)

/**
 * Create a DeepSeek provider adapter.
 *
 * Uses factory function pattern (not class) to keep the API surface minimal
 * and to allow easy dependency injection of fetch for testing.
 */
export function createDeepSeekAdapter(
  config: DeepSeekAdapterConfig,
  fetchFn: FetchFn = fetch,
): ProviderAdapter & Required<Pick<ProviderAdapter, "generateText">> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const defaultModel = config.defaultModel ?? DEFAULT_MODEL;
  const marginMultiplier = config.marginMultiplier ?? DEFAULT_MARGIN;
  const inputCostPer1M = config.inputTokenCostPer1M ?? DEFAULT_INPUT_COST_PER_1M;
  const outputCostPer1M = config.outputTokenCostPer1M ?? DEFAULT_OUTPUT_COST_PER_1M;
  const cachedInputCostPer1M = config.cachedInputTokenCostPer1M ?? DEFAULT_CACHED_INPUT_COST_PER_1M;

  return {
    name: "deepseek",
    capabilities: ["text-generation"] as const,

    async generateText(input: TextGenerationInput): Promise<AdapterResult<TextGenerationOutput>> {
      const model = input.model ?? defaultModel;

      if (!input.messages && !input.prompt) {
        throw new Error("DeepSeek adapter requires either 'messages' or 'prompt'");
      }

      const body: Record<string, unknown> = {
        model,
        messages: input.messages?.length ? input.messages : [{ role: "user", content: input.prompt }],
      };
      if (input.maxTokens !== undefined) {
        body.max_tokens = input.maxTokens;
      }
      if (input.temperature !== undefined) {
        body.temperature = input.temperature;
      }

      const res = await fetchFn(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const error = Object.assign(new Error("DeepSeek rate limit exceeded"), {
          httpStatus: 429,
          retryAfter: retryAfter ?? undefined,
        });
        throw error;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`DeepSeek API error (${res.status}): ${text}`);
      }

      const data = (await res.json()) as ChatCompletionResponse;

      const text = data.choices[0]?.message?.content ?? "";
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;

      // DeepSeek cache-aware cost calculation:
      // If cache hit/miss counts are present, use them for more accurate costing.
      // Cached tokens cost 90% less than regular input tokens.
      const cacheHitTokens = data.usage?.prompt_cache_hit_tokens ?? 0;
      const cacheMissTokens = data.usage?.prompt_cache_miss_tokens ?? 0;

      let inputCostUsd: number;
      const cacheTokenTotal = cacheHitTokens + cacheMissTokens;
      if (cacheTokenTotal > 0) {
        // Use granular cache-aware pricing; bill any uncovered tokens at standard rate
        const uncovered = Math.max(0, inputTokens - cacheTokenTotal);
        inputCostUsd =
          (cacheHitTokens / 1_000_000) * cachedInputCostPer1M +
          (cacheMissTokens / 1_000_000) * inputCostPer1M +
          (uncovered / 1_000_000) * inputCostPer1M;
      } else {
        // No cache info — charge all input at standard rate
        inputCostUsd = (inputTokens / 1_000_000) * inputCostPer1M;
      }

      const outputCostUsd = (outputTokens / 1_000_000) * outputCostPer1M;
      const cost = Credit.fromDollars(inputCostUsd + outputCostUsd);
      const charge = withMargin(cost, marginMultiplier);

      return {
        result: {
          text,
          model: data.model ?? model,
          usage: { inputTokens, outputTokens },
        },
        cost,
        charge,
      };
    },
  };
}
