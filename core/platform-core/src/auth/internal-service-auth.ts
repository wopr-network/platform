/**
 * Internal service authentication middleware.
 *
 * Authenticates server-to-server calls from UI servers and Holyship to the
 * core server. Core is NEVER exposed to the internet — only trusted internal
 * services with valid tokens can reach it.
 */

import { randomUUID, timingSafeEqual } from "node:crypto";

import type { Context, Next } from "hono";

// ---------------------------------------------------------------------------
// Shared types (inlined to avoid importing ./index.js which pulls in
// better-auth and its heavy dependency tree)
// ---------------------------------------------------------------------------

/** Minimal user shape for downstream middleware compatibility. */
interface AuthUser {
  id: string;
  roles: string[];
}

/**
 * Extract the bearer token from an Authorization header value.
 * Returns `null` if the header is missing, empty, or not a Bearer scheme.
 */
function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Valid product brands. */
export type Product = "wopr" | "paperclip" | "nemoclaw" | "holyship";

/** Context variables set by internalServiceAuth middleware. */
export interface InternalServiceAuthEnv {
  Variables: {
    /** The verified service identity (e.g., "wopr-ui", "holyship"). */
    serviceName: string;
    /** Tenant ID forwarded from the UI's session. */
    tenantId: string;
    /** User ID forwarded from the UI's session. */
    userId: string;
    /** Product brand. */
    product: Product;
    /** How the original user authenticated (forwarded from UI). */
    authMethod: string;
    /** User roles forwarded from the UI's session. */
    userRoles: string[];
    /** Request trace ID for correlation. */
    requestId: string;
    /** AuthUser — compatibility with existing middleware that reads c.get("user"). */
    user: AuthUser;
  };
}

export interface InternalServiceAuthConfig {
  /** Comma-separated list of allowed service tokens. */
  allowedTokens: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PRODUCTS = new Set<string>(["wopr", "paperclip", "nemoclaw", "holyship"]);

const MAX_HEADER_LENGTH = 255;

// ---------------------------------------------------------------------------
// Token Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the comma-separated allowedTokens string into a Map of token -> service name.
 *
 * Token format: `core_<service>_<random>`
 * Service name is extracted from the second segment.
 */
export function parseAllowedTokens(allowedTokens: string): Map<string, string> {
  const tokens = new Map<string, string>();
  if (!allowedTokens.trim()) return tokens;

  for (const raw of allowedTokens.split(",")) {
    const token = raw.trim();
    if (!token) continue;

    const parts = token.split("_");
    if (parts.length >= 3 && parts[0] === "core") {
      // core_<service>_<random...> — service is the second segment
      tokens.set(token, parts[1]);
    }
  }
  return tokens;
}

/**
 * Timing-safe token lookup. Iterates ALL allowed tokens to prevent
 * timing side-channel leaks on token validity.
 */
function timingSafeLookup(tokens: Map<string, string>, candidate: string): string | undefined {
  const candidateBuf = Buffer.from(candidate);
  let found: string | undefined;
  for (const [token, serviceName] of tokens) {
    const tokenBuf = Buffer.from(token);
    if (candidateBuf.length === tokenBuf.length && timingSafeEqual(candidateBuf, tokenBuf)) {
      found = serviceName;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Internal service authentication middleware.
 *
 * Validates the service token and extracts tenant/user/product context
 * from headers. Sets InternalServiceAuthEnv variables for downstream handlers.
 *
 * MUST only run on the private network. Never expose routes using this
 * middleware to the public internet.
 */
export function internalServiceAuth(config: InternalServiceAuthConfig) {
  // Parse tokens once at construction time, not per-request
  const tokenMap = parseAllowedTokens(config.allowedTokens);

  return async (c: Context<InternalServiceAuthEnv>, next: Next) => {
    // 1. Validate service token
    const token = extractBearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json({ error: "Missing service token" }, 401);
    }

    const serviceName = timingSafeLookup(tokenMap, token);
    if (!serviceName) {
      return c.json({ error: "Invalid service token" }, 401);
    }

    // 2. Extract and validate required headers
    const tenantId = c.req.header("X-Tenant-Id")?.trim();
    const userId = c.req.header("X-User-Id")?.trim();

    if (!tenantId || tenantId.length > MAX_HEADER_LENGTH) {
      return c.json({ error: "Missing or invalid X-Tenant-Id header" }, 400);
    }
    if (!userId || userId.length > MAX_HEADER_LENGTH) {
      return c.json({ error: "Missing or invalid X-User-Id header" }, 400);
    }

    // 3. Extract product header (defaults to "wopr" when missing or unknown)
    const productRaw = c.req.header("X-Product")?.trim()?.toLowerCase();
    const product: Product = productRaw && VALID_PRODUCTS.has(productRaw) ? (productRaw as Product) : "wopr";

    const authMethod = c.req.header("X-Auth-Method")?.trim() || "session";

    const rolesRaw = c.req.header("X-User-Roles")?.trim();
    const userRoles = rolesRaw
      ? rolesRaw
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean)
      : ["user"];

    const requestId = c.req.header("X-Request-Id")?.trim() || randomUUID();

    // 4. Set context variables
    c.set("serviceName", serviceName);
    c.set("tenantId", tenantId);
    c.set("userId", userId);
    c.set("product", product);
    c.set("authMethod", authMethod);
    c.set("userRoles", userRoles);
    c.set("requestId", requestId);

    // 5. Set AuthUser for compatibility with existing middleware
    c.set("user", { id: userId, roles: userRoles } satisfies AuthUser);

    return next();
  };
}
