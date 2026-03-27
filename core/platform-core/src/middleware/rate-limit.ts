/**
 * Rate-limiting middleware for Hono.
 *
 * Uses a fixed-window counter keyed by client IP. Each window is `windowMs`
 * milliseconds wide. When a client exceeds `max` requests in a window the
 * middleware responds with 429 Too Many Requests and a `Retry-After` header
 * indicating how many seconds remain in the current window.
 *
 * State is persisted via IRateLimitRepository (DB-backed in production).
 */

import type { Context, MiddlewareHandler, Next } from "hono";
import { getClientIpFromContext } from "./get-client-ip.js";
import type { IRateLimitRepository } from "./rate-limit-repository.js";

export { getClientIp, isPrivateIp, parseTrustedProxies } from "./get-client-ip.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum number of requests per window. */
  max: number;
  /** Window size in milliseconds (default: 60 000 = 1 minute). */
  windowMs?: number;
  /** Extract the rate-limit key from a request (default: client IP). */
  keyGenerator?: (c: Context) => string;
  /** Custom message returned in the 429 body (default provided). */
  message?: string;
  /** Repository for persisting rate-limit state. Required when rate limiting is active. */
  repo?: IRateLimitRepository;
  /** Scope identifier for this limiter (used as the DB scope key). */
  scope?: string;
}

export interface RateLimitRule {
  /** HTTP method to match, or "*" for any. */
  method: string;
  /** Path prefix to match (matched with `startsWith`). */
  pathPrefix: string;
  /** Rate-limit configuration for matching requests. */
  config: Omit<RateLimitConfig, "repo" | "scope">;
  /** Scope override (defaults to pathPrefix). */
  scope?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultKeyGenerator(c: Context): string {
  return getClientIpFromContext(c);
}

const DEFAULT_WINDOW_MS = 60_000; // 1 minute

// ---------------------------------------------------------------------------
// Single-route rate limiter
// ---------------------------------------------------------------------------

/**
 * Create a rate-limiting middleware for a single configuration.
 *
 * ```ts
 * app.use("/api/billing/*", rateLimit({ max: 10, repo, scope: "billing" }));
 * ```
 */
export function rateLimit(cfg: RateLimitConfig): MiddlewareHandler {
  const windowMs = cfg.windowMs ?? DEFAULT_WINDOW_MS;
  const keyGen = cfg.keyGenerator ?? defaultKeyGenerator;
  const scope = cfg.scope ?? "default";

  return async (c: Context, next: Next) => {
    // No repo — rate limiting disabled (e.g., test environments)
    if (!cfg.repo) return next();

    const now = Date.now();
    const key = keyGen(c);

    const entry = await cfg.repo.increment(key, scope, windowMs);
    const windowStart = entry.windowStart;
    const count = entry.count;

    // Check limit BEFORE this request counted — increment already happened
    const retryAfterSec = Math.ceil((windowStart + windowMs - now) / 1000);

    if (count > cfg.max) {
      c.header("X-RateLimit-Limit", String(cfg.max));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil((windowStart + windowMs) / 1000)));
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ error: cfg.message ?? "Too many requests, please try again later" }, 429);
    }

    const remaining = Math.max(0, cfg.max - count);

    c.header("X-RateLimit-Limit", String(cfg.max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil((windowStart + windowMs) / 1000)));

    return next();
  };
}

// ---------------------------------------------------------------------------
// Multi-route rate limiter (global middleware with per-route overrides)
// ---------------------------------------------------------------------------

/**
 * Create a global rate-limiting middleware that applies different limits based
 * on the request path and method.
 *
 * Rules are evaluated top-to-bottom; the **first** matching rule wins. If no
 * rule matches, the `defaultConfig` is used.
 *
 * ```ts
 * app.use("*", rateLimitByRoute(rules, { max: 60 }, repo));
 * ```
 */
export function rateLimitByRoute(
  rules: RateLimitRule[],
  defaultConfig: Omit<RateLimitConfig, "repo" | "scope">,
  repo: IRateLimitRepository,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();
    const path = c.req.path;

    // Find matching rule
    let cfg: Omit<RateLimitConfig, "repo" | "scope"> = defaultConfig;
    let scope = "default";
    for (const rule of rules) {
      const methodMatch = rule.method === "*" || rule.method.toUpperCase() === method;
      if (methodMatch && path.startsWith(rule.pathPrefix)) {
        cfg = rule.config;
        scope = rule.scope ?? rule.pathPrefix;
        break;
      }
    }

    const windowMs = cfg.windowMs ?? DEFAULT_WINDOW_MS;
    const keyGen = cfg.keyGenerator ?? defaultKeyGenerator;
    const now = Date.now();
    const key = keyGen(c);

    const entry = await repo.increment(key, scope, windowMs);
    const windowStart = entry.windowStart;
    const count = entry.count;

    const retryAfterSec = Math.ceil((windowStart + windowMs - now) / 1000);

    if (count > cfg.max) {
      c.header("X-RateLimit-Limit", String(cfg.max));
      c.header("X-RateLimit-Remaining", "0");
      c.header("X-RateLimit-Reset", String(Math.ceil((windowStart + windowMs) / 1000)));
      c.header("Retry-After", String(retryAfterSec));
      return c.json({ error: cfg.message ?? "Too many requests, please try again later" }, 429);
    }

    const remaining = Math.max(0, cfg.max - count);

    c.header("X-RateLimit-Limit", String(cfg.max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil((windowStart + windowMs) / 1000)));

    return next();
  };
}
