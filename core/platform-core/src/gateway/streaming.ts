/**
 * SSE stream proxy — proxies server-sent events from upstream providers
 * for streaming chat completions.
 *
 * Accumulates token usage during the stream and emits a meter event
 * after completion.
 */

import { Credit } from "@wopr-network/platform-core/credits";
import { logger } from "../config/logger.js";
import { withMargin } from "../monetization/adapters/types.js";
import { debitCredits } from "./credit-gate.js";
import type { ProxyDeps } from "./proxy.js";
import type { SellRateLookupFn } from "./rate-lookup.js";
import { DEFAULT_TOKEN_RATES, resolveTokenRates } from "./rate-lookup.js";
import type { GatewayTenant } from "./types.js";

/**
 * Proxy an SSE stream from upstream, metering after completion.
 *
 * If credits run out mid-stream, append a final SSE chunk with
 * a `finish_reason: "length"` and close the stream gracefully.
 */
export function proxySSEStream(
  upstreamResponse: Response,
  opts: {
    tenant: GatewayTenant;
    deps: ProxyDeps;
    capability: string;
    provider: string;
    costHeader: string | null;
    model?: string;
    rateLookupFn?: SellRateLookupFn;
  },
): Response {
  const { tenant, deps, capability, provider, costHeader } = opts;

  let accumulatedCost = 0;
  let isFreeModel = true;

  // If cost header is present and non-zero, use it (paid model).
  // Zero cost (free models) falls through to floor-rate billing.
  if (costHeader) {
    const parsed = parseFloat(costHeader);
    if (parsed > 0) {
      accumulatedCost = parsed;
      isFreeModel = false;
    }
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      // Pass through SSE chunks unchanged
      controller.enqueue(chunk);

      // Try to extract usage from SSE data chunks
      const text = new TextDecoder().decode(chunk);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            if (accumulatedCost === 0) {
              logger.warn("SSE stream completed without cost", {
                tenant: tenant.id,
                capability,
                provider,
                model: opts.model ?? "unknown",
                isFreeModel,
              });
            }
            break;
          }

          try {
            const data = JSON.parse(jsonStr) as {
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            };

            // Extract token usage from final chunk — compute cost based on model type
            if (data.usage && accumulatedCost === 0) {
              const inputTokens = data.usage.prompt_tokens ?? 0;
              const outputTokens = data.usage.completion_tokens ?? 0;

              if (isFreeModel && (tenant.floorInputRatePer1k || tenant.floorOutputRatePer1k)) {
                // Free model: use floor rates directly (no margin will be applied)
                const floorIn = tenant.floorInputRatePer1k ?? 0.00005;
                const floorOut = tenant.floorOutputRatePer1k ?? 0.0002;
                accumulatedCost = (inputTokens * floorIn + outputTokens * floorOut) / 1000;
              } else {
                // Paid model without cost header: estimate from DB sell rates
                if (!opts.rateLookupFn) {
                  logger.warn("SSE stream: no rateLookupFn provided — token cost will use default fallback rates", {
                    model: opts.model ?? "unknown",
                    capability,
                    inputTokens,
                    outputTokens,
                  });
                }
                const rates = opts.rateLookupFn
                  ? await resolveTokenRates(opts.rateLookupFn, capability, opts.model)
                  : DEFAULT_TOKEN_RATES;
                accumulatedCost = (inputTokens * rates.inputRatePer1K + outputTokens * rates.outputRatePer1K) / 1000;
              }
            }
          } catch (err) {
            logger.warn("Failed to parse SSE chunk JSON", {
              tenant: tenant.id,
              capability,
              provider,
              error: err instanceof Error ? err.message : String(err),
              jsonStr: jsonStr.length > 100 ? `${jsonStr.slice(0, 100)}...` : jsonStr,
            });
          }
        }
      }
    },

    async flush() {
      // Stream ended — emit meter event with accumulated cost
      const cost = Credit.fromDollars(accumulatedCost);
      // Free models: floor rate IS the final price (margin = 1). Paid models: apply product margin.
      const margin = isFreeModel ? 1 : (tenant.margin ?? deps.defaultMargin);
      const charge = withMargin(cost, margin);
      deps.meter.emit({
        tenant: tenant.id,
        instanceId: tenant.instanceId,
        productSlug: tenant.productSlug,
        cost,
        charge,
        capability,
        provider,
        timestamp: Date.now(),
      });

      // Debit credits (fire-and-forget)
      debitCredits(deps, tenant.id, accumulatedCost, margin, capability, provider);

      logger.info("Gateway proxy: SSE stream completed", {
        tenant: tenant.id,
        capability,
        provider,
        cost: accumulatedCost,
      });
    },
  });

  // Pipe upstream response body through transform stream
  if (upstreamResponse.body) {
    upstreamResponse.body.pipeTo(writable).catch((err) => {
      logger.error("SSE stream pipe error", { tenant: tenant.id, error: err });
    });
  }

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
