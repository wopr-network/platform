export const pricingData = {
  bot_price: { amount: 5, period: "month" },
  signup_credit: 5,
  capabilities: [
    {
      category: "Text Generation",
      icon: "bot" as const,
      models: [
        { name: "Claude Sonnet 4.6", unit: "1M input tokens", price: 3.0 },
        { name: "Claude Opus 4.6", unit: "1M input tokens", price: 15.0 },
        { name: "Gemini 2.5 Pro", unit: "1M input tokens", price: 1.25 },
        { name: "GPT-4o", unit: "1M input tokens", price: 2.5 },
        { name: "Kimi K3", unit: "1M input tokens", price: 0.8 },
      ],
    },
    {
      category: "Voice",
      icon: "mic" as const,
      models: [
        { name: "Text-to-Speech", unit: "1K characters", price: 0.2 },
        { name: "Speech-to-Text", unit: "minute", price: 0.02 },
      ],
    },
    {
      category: "Image Generation",
      icon: "image" as const,
      models: [
        { name: "SDXL", unit: "image", price: 0.03 },
        { name: "Flux", unit: "image", price: 0.05 },
      ],
    },
    {
      category: "Messaging",
      icon: "smartphone" as const,
      models: [{ name: "SMS", unit: "message", price: 0.01 }],
    },
  ],
} as const;

export type PricingData = typeof pricingData;
export type Capability = PricingData["capabilities"][number];
export type Model = Capability["models"][number];

/** Shape of a single rate from the API */
export interface ApiRate {
  name: string;
  unit: string;
  price: number;
}

/** Shape of GET /api/v1/pricing response */
export interface ApiPricingResponse {
  rates: Record<string, ApiRate[]>;
}

/** Shape of GET /api/v1/billing/dividend/stats response (public, no auth) */
export interface DividendStats {
  poolAmountDollars: number;
  activeUsers: number;
  projectedDailyDividend: number;
}

/** UI metadata for a capability key (display label + icon) */
export interface CapabilityMeta {
  category: string;
  icon: "bot" | "mic" | "image" | "smartphone";
}

/** Map backend capability keys to UI display metadata */
export const capabilityMeta: Record<string, CapabilityMeta> = {
  llm: { category: "Text Generation", icon: "bot" },
  tts: { category: "Voice", icon: "mic" },
  stt: { category: "Voice", icon: "mic" },
  image_gen: { category: "Image Generation", icon: "image" },
  sms: { category: "Messaging", icon: "smartphone" },
};

/** Merged capability for rendering: metadata + models from API */
export interface PricingCapability {
  category: string;
  icon: "bot" | "mic" | "image" | "smartphone";
  models: ApiRate[];
}

/** Ordered list of capability categories for stable rendering order */
const categoryOrder = ["Text Generation", "Voice", "Image Generation", "Messaging"];

/**
 * Merge API rates with UI metadata, grouping capabilities that share a category
 * (e.g. tts + stt both map to "Voice") and ordering by categoryOrder.
 * Falls back to capitalizing unknown keys with a generic icon.
 */
export function mergeApiRates(apiRates: Record<string, ApiRate[]>): PricingCapability[] {
  const grouped = new Map<string, PricingCapability>();

  for (const [key, models] of Object.entries(apiRates)) {
    const meta = capabilityMeta[key] ?? {
      category: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      icon: "bot" as const,
    };
    const existing = grouped.get(meta.category);
    if (existing) {
      existing.models.push(...models);
    } else {
      grouped.set(meta.category, { ...meta, models: [...models] });
    }
  }

  // Sort by categoryOrder; unknown categories go to the end
  return [...grouped.values()].sort((a, b) => {
    const ai = categoryOrder.indexOf(a.category);
    const bi = categoryOrder.indexOf(b.category);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
