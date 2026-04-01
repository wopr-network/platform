/**
 * Auth Social Router — exposes which OAuth providers are configured per product.
 *
 * Client IDs from DB (product_auth_config), secrets from Vault ({slug}/prod).
 * Zero downtime on new product: insert product row + auth config row.
 */

import type { ProductAuthManager } from "../auth/product-auth-manager.js";
import { publicProcedure, router } from "./init.js";

let _manager: ProductAuthManager | null = null;

export function setProductAuthManager(manager: ProductAuthManager): void {
  _manager = manager;
}

export const authSocialRouter = router({
  enabledSocialProviders: publicProcedure.query(async ({ ctx }) => {
    if (!_manager) return [];
    const slug = ctx.productSlug ?? "wopr";
    return _manager.getEnabledProviders(slug);
  }),
});
