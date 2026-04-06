/**
 * Internal tRPC context factory for standalone (service-to-service) mode.
 *
 * When the core server runs in standalone mode, incoming requests are
 * authenticated by internalServiceAuth middleware which sets user/tenant
 * context on the Hono context. This factory reads those values instead of
 * resolving a BetterAuth session from cookies.
 */

import type { Context } from "hono";
import type { InternalServiceAuthEnv } from "../auth/internal-service-auth.js";
import type { TRPCContext } from "./init.js";

/**
 * Build a TRPCContext from the Hono context populated by internalServiceAuth.
 *
 * The middleware guarantees userId, tenantId, and userRoles are present by the
 * time this runs (requests without valid tokens are rejected with 401/400).
 */
export function createInternalTRPCContext(c: Context<InternalServiceAuthEnv>): TRPCContext {
  const ctx = c as unknown as { get(k: string): string | undefined };
  const user = c.get("user");
  // Service token users are identified by their roles (e.g. ["service", "platform_admin"]),
  // not by an ID prefix. The token: prefix was removed because it broke tenantId === userId
  // comparisons in assertOrgAdminOrOwner and other downstream checks.
  return {
    user,
    tenantId: c.get("tenantId"),
    productSlug: c.req.header("x-product") ?? ctx.get("product") ?? undefined,
    userEmail: ctx.get("userEmail") ?? undefined,
  };
}
