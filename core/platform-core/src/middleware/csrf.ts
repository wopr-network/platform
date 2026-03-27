import type { MiddlewareHandler } from "hono";
import { extractBearerToken } from "../auth/index.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Check whether a path matches any of the exempt patterns.
 * Patterns ending with "*" match as prefixes; exact strings match exactly.
 */
function isExempt(path: string, exemptPaths: string[]): boolean {
  for (const pattern of exemptPaths) {
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (path.startsWith(prefix)) return true;
    } else {
      if (path === pattern) return true;
    }
  }
  return false;
}

/**
 * Validate that a request's Origin or Referer matches one of the allowed origins.
 * Returns true if the request is safe, false if it should be blocked.
 */
export function validateCsrfOrigin(headers: Headers, allowedOrigins: string[]): boolean {
  const origin = headers.get("origin");

  // Check Origin header first (most reliable)
  if (origin) {
    return allowedOrigins.includes(origin);
  }

  // Fall back to Referer header
  const referer = headers.get("referer");
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      return allowedOrigins.includes(refererOrigin);
    } catch {
      return false;
    }
  }

  // No Origin or Referer on a mutation request — block it
  return false;
}

export interface CsrfOptions {
  /** Allowed origins (e.g. ["https://app.example.com"]). */
  allowedOrigins: string[];
  /**
   * Paths exempt from CSRF validation.
   * Use trailing "*" for prefix matching (e.g. "/api/auth/*").
   * Exact strings match exactly (e.g. "/api/billing/webhook").
   */
  exemptPaths?: string[];
}

/**
 * Hono middleware that validates Origin/Referer on state-changing requests.
 * Skips:
 * - GET/HEAD/OPTIONS requests (safe methods)
 * - Requests with Bearer token (not vulnerable to CSRF)
 * - Exempt paths (configurable)
 */
export function csrfProtection(options: CsrfOptions): MiddlewareHandler {
  const exempt = options.exemptPaths ?? [];

  return async (c, next) => {
    // Safe methods — no CSRF risk
    if (!MUTATION_METHODS.has(c.req.method)) {
      return next();
    }

    // Exempt paths
    if (isExempt(c.req.path, exempt)) {
      return next();
    }

    // Bearer-token requests are not vulnerable to CSRF (browser doesn't auto-send)
    const authHeader = c.req.header("Authorization");
    if (extractBearerToken(authHeader)) {
      return next();
    }

    // Unauthenticated requests (no session user, no bearer token) cannot be CSRF attacks —
    // there is no credential to hijack. Let auth middleware return 401 naturally.
    const user = c.get("user" as never);
    if (!user) {
      return next();
    }

    // Validate Origin/Referer
    if (!validateCsrfOrigin(c.req.raw.headers, options.allowedOrigins)) {
      return c.json({ error: "CSRF validation failed" }, 403);
    }

    return next();
  };
}
