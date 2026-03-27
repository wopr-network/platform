import { Hono } from "hono";

import type { PlatformContainer } from "../container.js";

/**
 * Stripe webhook route factory.
 *
 * Delegates to `container.stripe.processor.handleWebhook()` which
 * calls `stripe.webhooks.constructEvent()` internally for signature
 * verification.
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

    try {
      const result = await container.stripe.processor.handleWebhook(rawBody, sig);
      return c.json({ ok: true, result }, 200);
    } catch {
      return c.json({ error: "Webhook processing failed" }, 400);
    }
  });

  return routes;
}
