/**
 * Auth Social Router — exposes which OAuth providers are configured per product.
 *
 * Client IDs from DB (product_auth_config), secrets from Vault ({slug}/prod).
 * Zero downtime on new product: insert product row + auth config row.
 */

import { TRPCError } from "@trpc/server";
import type { ProductAuthManager } from "../auth/product-auth-manager.js";
import { publicProcedure, router } from "./init.js";

let _manager: ProductAuthManager | null = null;

export function setProductAuthManager(manager: ProductAuthManager): void {
  _manager = manager;
}

export const authSocialRouter = router({
  enabledSocialProviders: publicProcedure.query(async ({ ctx }) => {
    if (!_manager) return [];
    if (!ctx.productSlug) throw new TRPCError({ code: "BAD_REQUEST", message: "Product slug required" });
    const slug = ctx.productSlug;
    return _manager.getEnabledProviders(slug);
  }),
});
