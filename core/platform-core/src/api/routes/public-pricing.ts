import { Hono } from "hono";
import type { RateStore } from "../../admin/rates/rate-store.js";

/**
 * Create public pricing routes.
 *
 * Public, unauthenticated endpoint returning active sell rates grouped by capability.
 * Used by pricing pages to display current rates.
 */
export function createPublicPricingRoutes(storeFactory: () => RateStore): Hono {
  const routes = new Hono();

  routes.get("/", async (c) => {
    try {
      const store = storeFactory();
      const rates = await store.listPublicRates();

      // Group by capability for the UI
      const grouped: Record<string, Array<{ name: string; unit: string; price: number }>> = {};
      for (const rate of rates) {
        if (!grouped[rate.capability]) grouped[rate.capability] = [];
        grouped[rate.capability].push({
          name: rate.display_name,
          unit: rate.unit,
          price: rate.price_usd,
        });
      }

      return c.json({ rates: grouped });
    } catch {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  return routes;
}
