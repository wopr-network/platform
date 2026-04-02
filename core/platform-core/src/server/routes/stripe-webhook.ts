import { Hono } from "hono";

import { loadCreditPriceMap } from "../../billing/stripe/credit-prices.js";
import { logger } from "../../config/logger.js";
import { handleWebhookEvent } from "../../monetization/stripe/webhook.js";
import type { PlatformContainer } from "../container.js";

/**
 * Stripe webhook route factory.
 *
 * Resolves per-product webhook secret + price map from DB.
 * Calls handleWebhookEvent directly with shared deps (ledger, replay guard)
 * and per-product config (price map). No boot-time singleton dependency.
 */
export function createStripeWebhookRoutes(container: PlatformContainer): Hono {
  const routes = new Hono();

  routes.post("/", async (c) => {
    if (!container.stripe) {
      return c.json({ error: "Stripe not configured" }, 501);
    }

    const rawBody = Buffer.from(await c.req.arrayBuffer());
    const sig = c.req.header("stripe-signature");

    if (!sig) {
      return c.json({ error: "Missing stripe-signature header" }, 400);
    }

    const host = c.req.header("host")?.split(":")[0] ?? "";
    const hostBase = host.startsWith("api.") ? host.slice(4) : host;
    logger.info("Stripe webhook received", { host, hostBase, sigLen: sig.length });

    // Collect webhook secrets to try: per-product from DB first, boot-time fallback last.
    const allProducts = await container.productConfigService.listAll();
    const candidates: Array<{
      label: string;
      secret: string;
      priceMap: ReturnType<typeof loadCreditPriceMap>;
    }> = [];

    for (const pc of allProducts) {
      const matches =
        pc.product.domain === hostBase ||
        pc.product.appDomain === host ||
        pc.domains.some((d) => d.host === host || d.host === hostBase);
      if (!matches) continue;
      if (!pc.billing?.stripeWebhookSecret) {
        logger.warn("Stripe webhook: product matched but no webhook secret", { product: pc.product.slug });
        continue;
      }
      candidates.push({
        label: pc.product.slug,
        secret: pc.billing.stripeWebhookSecret,
        priceMap: loadCreditPriceMap(pc.billing.creditPrices as Record<string, unknown>),
      });
    }
    // Boot-time fallback (uses container's price map)
    candidates.push({
      label: "boot-default",
      secret: container.stripe.webhookSecret,
      priceMap: container.priceMap ?? new Map(),
    });

    // Try each secret until one verifies, then process the event
    for (const candidate of candidates) {
      if (!candidate.secret) continue;
      logger.info("Stripe webhook: trying key", { label: candidate.label });
      try {
        const event = container.stripe.stripe.webhooks.constructEvent(rawBody, sig, candidate.secret);
        logger.info("Stripe webhook: signature verified", { label: candidate.label, eventType: event.type });

        // Process with shared deps + per-product price map
        const result = await handleWebhookEvent(
          {
            tenantRepo: container.stripe.customerRepo,
            creditLedger: container.creditLedger,
            priceMap: candidate.priceMap,
            replayGuard: container.webhookSeenRepo,
          },
          event,
        );
        logger.info("Stripe webhook processed", {
          label: candidate.label,
          handled: result.handled,
          eventType: result.event_type,
          tenant: result.tenant,
          creditedCents: result.creditedCents,
        });
        return c.json({ ok: true, result }, 200);
      } catch (err) {
        logger.warn("Stripe webhook: key failed", { label: candidate.label, error: String(err) });
      }
    }

    logger.error("Stripe webhook failed (all keys exhausted)", { host, candidateCount: candidates.length });
    return c.json({ error: "Webhook processing failed" }, 400);
  });

  return routes;
}
