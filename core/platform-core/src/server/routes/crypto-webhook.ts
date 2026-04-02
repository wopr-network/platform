/**
 * Crypto webhook route — accepts payment confirmations from the key server.
 *
 * Extracted from paperclip-platform into platform-core so every product
 * gets the same timing-safe auth, Zod validation, and idempotent handler
 * without copy-pasting.
 */

import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import type { CryptoWebhookPayload } from "../../billing/crypto/index.js";
import { handleKeyServerWebhook } from "../../billing/crypto/key-server-webhook.js";
import { logger } from "../../config/logger.js";
import type { PlatformContainer } from "../container.js";

// ---------------------------------------------------------------------------
// Zod schema for incoming webhook payloads
// ---------------------------------------------------------------------------

const cryptoWebhookSchema = z.object({
  chargeId: z.string().min(1),
  chain: z.string().min(1),
  token: z.string().optional(),
  address: z.string().min(1),
  amountUsdCents: z.number().optional(),
  amountReceivedCents: z.number().optional(),
  amountExpectedCents: z.number().optional(),
  expectedAmount: z.string().optional(),
  receivedAmount: z.string().optional(),
  status: z.string().min(1),
  txHash: z.string().optional(),
  amountReceived: z.string().optional(),
  confirmations: z.number().optional(),
  confirmationsRequired: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Config accepted at mount time
// ---------------------------------------------------------------------------

export interface CryptoWebhookConfig {
  provisionSecret: string;
  cryptoServiceKey?: string;
}

// ---------------------------------------------------------------------------
// Timing-safe secret validation
// ---------------------------------------------------------------------------

function assertSecret(authHeader: string | undefined, config: CryptoWebhookConfig): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();

  const secrets = [config.provisionSecret, config.cryptoServiceKey].filter((s): s is string => !!s);

  for (const secret of secrets) {
    if (token.length === secret.length && timingSafeEqual(Buffer.from(token), Buffer.from(secret))) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create the crypto webhook Hono sub-app.
 *
 * Mount it at `/api/webhooks/crypto` (or wherever the product prefers).
 *
 * ```ts
 * app.route("/api/webhooks/crypto", createCryptoWebhookRoutes(container, config));
 * ```
 */
export function createCryptoWebhookRoutes(container: PlatformContainer, config: CryptoWebhookConfig): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    logger.info("[crypto-webhook] Received POST");
    if (!assertSecret(c.req.header("authorization"), config)) {
      logger.warn("[crypto-webhook] Auth failed — token mismatch");
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!container.crypto) {
      logger.warn("[crypto-webhook] Crypto not configured (container.crypto is null)");
      return c.json({ error: "Crypto payments not configured" }, 501);
    }

    let payload: CryptoWebhookPayload;
    try {
      const raw = await c.req.json();
      payload = cryptoWebhookSchema.parse(raw) as CryptoWebhookPayload;
    } catch (err) {
      if (err instanceof z.ZodError) {
        logger.warn("[crypto-webhook] Invalid payload", err.issues);
        return c.json({ error: "Invalid payload", issues: err.issues }, 400);
      }
      logger.warn("[crypto-webhook] Invalid JSON");
      return c.json({ error: "Invalid JSON" }, 400);
    }

    logger.info("[crypto-webhook] Processing", {
      chargeId: payload.chargeId,
      status: payload.status,
      confirmations: payload.confirmations,
    });
    const result = await handleKeyServerWebhook(
      {
        chargeStore: container.crypto.chargeRepo,
        creditLedger: container.creditLedger,
        replayGuard: container.crypto.webhookSeenRepo,
      },
      payload,
    );

    logger.info("[crypto-webhook] Result", result);
    return c.json(result, 200);
  });

  return app;
}
