/**
 * WOPR Credit price points and bonus tiers.
 *
 * One Stripe Product ("WOPR Credits") with 5 preset Price objects.
 * Each price maps to a dollar amount and a credit value (with optional bonus).
 *
 * Price IDs are loaded from environment variables so they can differ
 * between Stripe test/live modes.
 */

/**
 * A preset credit purchase option.
 *
 * IMPORTANT — naming convention (WOP-1058):
 * - amountCents: USD cents charged to Stripe (monetary — DO NOT rename to _credits).
 *   This value is passed to Stripe's checkout session and PaymentIntent APIs.
 * - creditCents: USD cents worth of platform credits granted (includes bonus).
 *   Named _cents because the platform credit unit = 1 USD cent.
 *   Passed to Credit.fromCents() — NOT a raw Credit nanodollar value.
 */
export interface CreditPricePoint {
  /** Human-readable label. */
  label: string;
  /** Amount charged in USD cents (Stripe monetary — DO NOT rename to _credits). */
  amountCents: number;
  /** Platform credits granted in USD cents (includes bonus — DO NOT rename to _credits). */
  creditCents: number;
  /** Bonus percentage (0 for no bonus). */
  bonusPercent: number;
}

/**
 * The 5 preset credit tiers.
 *
 * Bonus logic:
 *   $5   -> $5.00 credit   (0% bonus)
 *   $10  -> $10.00 credit  (0% bonus)
 *   $25  -> $25.50 credit  (2% bonus)
 *   $50  -> $52.50 credit  (5% bonus)
 *   $100 -> $110.00 credit (10% bonus)
 */
export const CREDIT_PRICE_POINTS: readonly CreditPricePoint[] = [
  { label: "$5", amountCents: 500, creditCents: 500, bonusPercent: 0 },
  { label: "$10", amountCents: 1000, creditCents: 1000, bonusPercent: 0 },
  { label: "$25", amountCents: 2500, creditCents: 2550, bonusPercent: 2 },
  { label: "$50", amountCents: 5000, creditCents: 5250, bonusPercent: 5 },
  { label: "$100", amountCents: 10000, creditCents: 11000, bonusPercent: 10 },
] as const;

/**
 * DB column keys mapping to CREDIT_PRICE_POINTS indices.
 * The `credit_prices` jsonb column in product_billing_config stores:
 *   { "500": "price_xxx", "1000": "price_yyy", ... }
 * where keys are amountCents strings and values are Stripe Price IDs.
 */
const AMOUNT_KEYS = ["500", "1000", "2500", "5000", "10000"] as const;

/** Mapping from Stripe Price ID -> CreditPricePoint. */
export type CreditPriceMap = ReadonlyMap<string, CreditPricePoint>;

/**
 * Load credit price mappings from the DB-stored credit_prices record.
 *
 * @param creditPrices - Record from product_billing_config.credit_prices jsonb.
 *   Keys are amountCents as strings ("500", "1000", etc.), values are Stripe Price IDs.
 * @returns Map from Stripe Price ID -> CreditPricePoint.
 */
export function loadCreditPriceMap(creditPrices?: Record<string, unknown>): CreditPriceMap {
  const map = new Map<string, CreditPricePoint>();

  if (!creditPrices) return map;

  for (let i = 0; i < AMOUNT_KEYS.length; i++) {
    const priceId = creditPrices[AMOUNT_KEYS[i]];
    if (typeof priceId === "string" && priceId) {
      map.set(priceId, CREDIT_PRICE_POINTS[i]);
    }
  }

  return map;
}

/**
 * Get the credit amount (in cents) for a given purchase amount (in cents).
 *
 * Uses the bonus tiers to determine the credit value.
 * Falls back to 1:1 if no matching tier is found.
 */
export function getCreditAmountForPurchase(amountCents: number): number {
  const tier = CREDIT_PRICE_POINTS.find((p) => p.amountCents === amountCents);
  return tier ? tier.creditCents : amountCents;
}

/**
 * Look up a CreditPricePoint by Stripe Price ID using the price map.
 * Returns null if the price ID is not recognized.
 */
export function lookupCreditPrice(priceMap: CreditPriceMap, priceId: string): CreditPricePoint | null {
  return priceMap.get(priceId) ?? null;
}

/** Get all configured Stripe Price IDs from a credit prices record. */
export function getConfiguredPriceIds(creditPrices?: Record<string, unknown>): string[] {
  if (!creditPrices) return [];
  return AMOUNT_KEYS.map((key) => creditPrices[key]).filter((v): v is string => typeof v === "string" && v.length > 0);
}
