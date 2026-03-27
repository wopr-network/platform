/**
 * Metered billing price configuration.
 *
 * Maps capability names to their Stripe Billing Meter event names.
 * Stripe v20 uses the Billing Meters API (stripe.billing.meterEvents.create)
 * instead of the legacy subscriptionItems.createUsageRecord API.
 *
 * Pattern follows loadCreditPriceMap() in credit-prices.ts.
 */

/** Maps capability name to its metered Stripe configuration. */
export interface MeteredPriceConfig {
  /** Stripe Billing Meter event name (e.g., "chat_completions_usage"). */
  eventName: string;
  /** Stripe Billing Meter ID for reconciliation lookups (e.g., mtr_xxx). Optional. */
  meterId?: string;
}

/** Maps capability name to MeteredPriceConfig. */
export type MeteredPriceMap = ReadonlyMap<string, MeteredPriceConfig>;

const METERED_CAPABILITIES: Array<{
  capability: string;
  eventEnvVar: string;
  meterEnvVar: string;
  defaultEvent: string;
}> = [
  {
    capability: "chat-completions",
    eventEnvVar: "STRIPE_METERED_EVENT_CHAT",
    meterEnvVar: "STRIPE_METERED_METER_CHAT",
    defaultEvent: "chat_completions_usage",
  },
  {
    capability: "tts",
    eventEnvVar: "STRIPE_METERED_EVENT_TTS",
    meterEnvVar: "STRIPE_METERED_METER_TTS",
    defaultEvent: "tts_usage",
  },
  {
    capability: "transcription",
    eventEnvVar: "STRIPE_METERED_EVENT_TRANSCRIPTION",
    meterEnvVar: "STRIPE_METERED_METER_TRANSCRIPTION",
    defaultEvent: "transcription_usage",
  },
  {
    capability: "image-generation",
    eventEnvVar: "STRIPE_METERED_EVENT_IMAGE",
    meterEnvVar: "STRIPE_METERED_METER_IMAGE",
    defaultEvent: "image_generation_usage",
  },
  {
    capability: "embeddings",
    eventEnvVar: "STRIPE_METERED_EVENT_EMBEDDINGS",
    meterEnvVar: "STRIPE_METERED_METER_EMBEDDINGS",
    defaultEvent: "embeddings_usage",
  },
  {
    capability: "phone-inbound",
    eventEnvVar: "STRIPE_METERED_EVENT_PHONE_IN",
    meterEnvVar: "STRIPE_METERED_METER_PHONE_IN",
    defaultEvent: "phone_inbound_usage",
  },
  {
    capability: "phone-outbound",
    eventEnvVar: "STRIPE_METERED_EVENT_PHONE_OUT",
    meterEnvVar: "STRIPE_METERED_METER_PHONE_OUT",
    defaultEvent: "phone_outbound_usage",
  },
  {
    capability: "sms",
    eventEnvVar: "STRIPE_METERED_EVENT_SMS",
    meterEnvVar: "STRIPE_METERED_METER_SMS",
    defaultEvent: "sms_usage",
  },
];

/**
 * Load metered price mappings from environment variables.
 *
 * Returns a Map from capability name -> MeteredPriceConfig.
 * All capabilities are included with default event names.
 * meterId is only populated when the env var is set.
 */
export function loadMeteredPriceMap(): MeteredPriceMap {
  const map = new Map<string, MeteredPriceConfig>();

  for (const { capability, eventEnvVar, meterEnvVar, defaultEvent } of METERED_CAPABILITIES) {
    const eventName = process.env[eventEnvVar] ?? defaultEvent;
    const meterId = process.env[meterEnvVar];
    map.set(capability, { eventName, ...(meterId ? { meterId } : {}) });
  }

  return map;
}
