import Stripe from "stripe";
import type { StripeBillingConfig } from "./types.js";

/**
 * The Stripe API version to use for all requests.
 * Pinning this ensures stability across Stripe API releases.
 */
const STRIPE_API_VERSION = "2024-12-18.acacia";

/**
 * Create a configured Stripe client.
 *
 * All Stripe config comes from env vars — no billing logic in WOPR,
 * just a thin wrapper around the Stripe SDK.
 */
export function createStripeClient(config: StripeBillingConfig): Stripe {
  return new Stripe(config.secretKey, {
    // @ts-expect-error stripe-version-2024-12-18.acacia
    apiVersion: STRIPE_API_VERSION,
  });
}

/**
 * Load Stripe billing config from explicit secrets.
 * Returns null if required values are missing.
 */
export function loadStripeConfig(secrets: {
  stripeSecretKey?: string | null;
  stripeWebhookSecret?: string | null;
}): StripeBillingConfig | null {
  const secretKey = secrets.stripeSecretKey;
  const webhookSecret = secrets.stripeWebhookSecret;

  if (!secretKey || !webhookSecret) {
    return null;
  }

  return {
    secretKey,
    webhookSecret,
  };
}
