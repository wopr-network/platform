/**
 * Admin auth middleware — timing-safe API key verification.
 *
 * Factory function that creates a Hono middleware handler requiring
 * a valid admin API key in the Authorization header. Uses
 * `crypto.timingSafeEqual` to prevent timing side-channel attacks.
 */

import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export interface AdminAuthConfig {
  adminApiKey: string;
}

/**
 * Create an admin auth middleware that validates Bearer tokens
 * against the configured admin API key using timing-safe comparison.
 *
 * Fail-closed: if the key is empty or missing, all requests are rejected.
 */
export function createAdminAuthMiddleware(config: AdminAuthConfig): MiddlewareHandler {
  const { adminApiKey } = config;

  return async (c, next) => {
    // Fail closed: if no admin key is configured, reject everything
    if (!adminApiKey) {
      return c.json({ error: "Admin authentication not configured" }, 503);
    }

    const authHeader = c.req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized: admin authentication required" }, 401);
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return c.json({ error: "Unauthorized: admin authentication required" }, 401);
    }

    // Timing-safe comparison: both buffers must be the same length
    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(adminApiKey);

    if (tokenBuf.length !== keyBuf.length || !timingSafeEqual(tokenBuf, keyBuf)) {
      return c.json({ error: "Unauthorized: invalid admin credentials" }, 401);
    }

    return next();
  };
}
