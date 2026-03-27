/**
 * MiniMax hosted adapter -- text generation via MiniMax's OpenAI-compatible API.
 *
 * MiniMax offers competitive pricing on frontier models (M2/M2.5),
 * making it a strong mid-tier option for inference arbitrage.
 * Bypasses OpenRouter entirely — no 5.5% credit fee.
 *
 * Cost is calculated from the usage object returned by the chat completions
 * API (prompt_tokens + completion_tokens) using configured per-model rates.
 */

import { Credit } from "@wopr-network/platform-core/credits";
import type { AdapterResult, ProviderAdapter, TextGenerationInput, TextGenerationOutput } from "./types.js";
import { withMargin } from "./types.js";

/** Configuration for the MiniMax adapter */
export interface MiniMaxAdapterConfig {
  /** MiniMax API key */
  apiKey: string;
  /** MiniMax API base URL (default: https://api.minimax.chat) */
  baseUrl?: string;
  /** Default model (default: "minimax-m2") */
  defaultModel?: string;
  /** Cost per 1M input tokens in USD (default: $0.255) */
  inputTokenCostPer1M?: number;
  /** Cost per 1M output tokens in USD (default: $1.00) */
  outputTokenCostPer1M?: number;
  /** Margin multiplier (default: 1.3) */
  marginMultiplier?: number;
}

/**
 * A function that performs an HTTP fetch. Accepts the same signature as
 * the global `fetch`. This indirection lets tests inject a stub without
 * mocking globals.
 */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** OpenAI-compatible chat completion response (subset we care about) */
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
  };
}

const DEFAULT_BASE_URL = "https://api.minimax.chat";
const DEFAULT_MODEL = "minimax-m2";
const DEFAULT_MARGIN = 1.3;
// MiniMax M2 pricing (March 2026)
const DEFAULT_INPUT_COST_PER_1M = 0.255; // $0.255 per 1M input tokens
const DEFAULT_OUTPUT_COST_PER_1M = 1.0; // $1.00 per 1M output tokens

/**
 * Create a MiniMax provider adapter.
 *
 * Uses factory function pattern (not class) to keep the API surface minimal
 * and to allow easy dependency injection of fetch for testing.
 */
export function createMiniMaxAdapter(
  config: MiniMaxAdapterConfig,
  fetchFn: FetchFn = fetch,
): ProviderAdapter & Required<Pick<ProviderAdapter, "generateText">> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const defaultModel = config.defaultModel ?? DEFAULT_MODEL;
  const marginMultiplier = config.marginMultiplier ?? DEFAULT_MARGIN;
  const inputCostPer1M = config.inputTokenCostPer1M ?? DEFAULT_INPUT_COST_PER_1M;
  const outputCostPer1M = config.outputTokenCostPer1M ?? DEFAULT_OUTPUT_COST_PER_1M;

  return {
    name: "minimax",
    capabilities: ["text-generation"] as const,

    async generateText(input: TextGenerationInput): Promise<AdapterResult<TextGenerationOutput>> {
      const model = input.model ?? defaultModel;

      if (!input.messages && !input.prompt) {
        throw new Error("MiniMax adapter requires either 'messages' or 'prompt'");
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
        const error = Object.assign(new Error("MiniMax rate limit exceeded"), {
          httpStatus: 429,
          retryAfter: retryAfter ?? undefined,
        });
        throw error;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`MiniMax API error (${res.status}): ${text}`);
      }

      const data = (await res.json()) as ChatCompletionResponse;

      const text = data.choices[0]?.message?.content ?? "";
      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;

      const cost = Credit.fromDollars(
        (inputTokens / 1_000_000) * inputCostPer1M + (outputTokens / 1_000_000) * outputCostPer1M,
      );
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
