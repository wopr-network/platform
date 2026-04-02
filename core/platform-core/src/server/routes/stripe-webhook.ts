import { Hono } from "hono";

import { logger } from "../../config/logger.js";
import type { PlatformContainer } from "../container.js";

/**
 * Stripe webhook route factory.
 *
 * Tries per-product webhook secret first (from product_billing_config),
 * then falls back to the boot-time processor's secret.
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

    // Try per-product webhook verification: resolve product from host,
    // look up its webhook secret, and build a one-shot processor.
    const allProducts = await container.productConfigService.listAll();
    const host = c.req.header("host")?.split(":")[0] ?? "";
    const hostBase = host.startsWith("api.") ? host.slice(4) : host;

    for (const pc of allProducts) {
      const matches = pc.product.domain === hostBase || pc.product.appDomain === host ||
        pc.domains.some((d) => d.host === host || d.host === hostBase);
      if (!matches || !pc.billing?.stripeWebhookSecret) continue;

      try {
        const Stripe = (await import("stripe")).default;
        const stripeClient = new Stripe(pc.billing.stripeSecretKey ?? "");
        const { StripePaymentProcessor } = await import("../../billing/stripe/stripe-payment-processor.js");
        const { loadCreditPriceMap } = await import("../../billing/stripe/credit-prices.js");
        const processor = new StripePaymentProcessor({
          stripe: stripeClient,
          tenantRepo: container.stripe.customerRepo,
          webhookSecret: pc.billing.stripeWebhookSecret,
          priceMap: loadCreditPriceMap(pc.billing.creditPrices as Record<string, unknown>),
          creditLedger: container.creditLedger,
        });
        const result = await processor.handleWebhook(rawBody, sig);
        logger.info("Stripe webhook processed (per-product)", { product: pc.product.slug, result });
        return c.json({ ok: true, result }, 200);
      } catch {
        // Signature didn't match this product — try next or fall back
      }
    }

    // Fallback: boot-time processor
    try {
      const result = await container.stripe.processor.handleWebhook(rawBody, sig);
      return c.json({ ok: true, result }, 200);
    } catch (err) {
      logger.warn("Stripe webhook failed", { error: String(err) });
      return c.json({ error: "Webhook processing failed" }, 400);
    }
  });

  return routes;
}
