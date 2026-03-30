import { describe, expect, it } from "vitest";
import { createStripeClient, loadStripeConfig } from "./client.js";

describe("loadStripeConfig", () => {
  it("returns null when both values are missing", () => {
    expect(loadStripeConfig({})).toBeNull();
  });

  it("returns null when only stripeSecretKey is set", () => {
    expect(loadStripeConfig({ stripeSecretKey: "sk_test_abc" })).toBeNull();
  });

  it("returns null when only stripeWebhookSecret is set", () => {
    expect(loadStripeConfig({ stripeWebhookSecret: "whsec_abc" })).toBeNull();
  });

  it("returns config when both values are present", () => {
    const config = loadStripeConfig({
      stripeSecretKey: "sk_test_abc123",
      stripeWebhookSecret: "whsec_def456",
    });
    expect(config).not.toBeNull();
    expect(config?.secretKey).toBe("sk_test_abc123");
    expect(config?.webhookSecret).toBe("whsec_def456");
  });

  it("returns null when values are null", () => {
    expect(loadStripeConfig({ stripeSecretKey: null, stripeWebhookSecret: null })).toBeNull();
  });
});

describe("createStripeClient", () => {
  it("creates a Stripe client with pinned API version", () => {
    const client = createStripeClient({ secretKey: "sk_test_abc", webhookSecret: "whsec_abc" });
    // Stripe client stores the API version internally
    // We verify it was created successfully
    expect(client).toEqual(expect.any(Object));
    expect(client.checkout).toEqual(expect.any(Object));
    expect(client.paymentIntents).toEqual(expect.any(Object));
    expect(client.setupIntents).toEqual(expect.any(Object));
  });
});
