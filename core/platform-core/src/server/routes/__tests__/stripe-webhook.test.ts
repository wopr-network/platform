import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createTestContainer } from "../../test-container.js";
import { createStripeWebhookRoutes } from "../stripe-webhook.js";

function makeApp(stripeOverride?: unknown) {
  const container = createTestContainer(
    stripeOverride !== undefined ? { stripe: stripeOverride as ReturnType<typeof createTestContainer>["stripe"] } : {},
  );
  const app = new Hono();
  app.route("/api/webhooks/stripe", createStripeWebhookRoutes(container));
  return app;
}

describe("stripe webhook route", () => {
  it("returns 501 when stripe not configured", async () => {
    const app = makeApp(null);
    const res = await app.request("/api/webhooks/stripe", { method: "POST" });
    expect(res.status).toBe(501);
  });

  it("returns 400 when stripe-signature header missing", async () => {
    const app = makeApp({
      stripe: {},
      webhookSecret: "whsec_test",
      customerRepo: {},
      processor: { handleWebhook: vi.fn() },
    });
    const res = await app.request("/api/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing stripe-signature header");
  });

  it("returns 200 on valid webhook", async () => {
    const handleWebhook = vi.fn().mockResolvedValue({ handled: true, event_type: "checkout.session.completed" });
    const app = makeApp({
      stripe: {},
      webhookSecret: "whsec_test",
      customerRepo: {},
      processor: { handleWebhook },
    });
    const res = await app.request("/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=abc" },
      body: '{"type":"checkout.session.completed"}',
    });
    expect(res.status).toBe(200);
    expect(handleWebhook).toHaveBeenCalledOnce();
  });

  it("returns 400 when processor throws (bad signature)", async () => {
    const handleWebhook = vi.fn().mockRejectedValue(new Error("Signature verification failed"));
    const app = makeApp({
      stripe: {},
      webhookSecret: "whsec_test",
      customerRepo: {},
      processor: { handleWebhook },
    });
    const res = await app.request("/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=bad" },
      body: "invalid",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Webhook processing failed");
  });
});
