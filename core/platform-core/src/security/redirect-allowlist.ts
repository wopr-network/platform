/**
 * Dynamic origin allowlist. Product domains are registered at boot via
 * `registerAllowedOrigins()` — no hardcoded domains or env vars needed.
 */
const _dynamicOrigins = new Set<string>();

/** Register additional allowed redirect origins (called at boot from product config). */
export function registerAllowedOrigins(origins: string[]): void {
  for (const o of origins) {
    _dynamicOrigins.add(o);
  }
}

function getAllowedOrigins(): string[] {
  return [
    ..._dynamicOrigins,
    ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:3001"] : []),
  ];
}

/**
 * Throws if `url` is not rooted at one of the allowed origins.
 * Comparison is scheme + host (origin), not prefix string match,
 * to prevent bypasses like `https://app.wopr.bot.evil.com`.
 */
export function assertSafeRedirectUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid redirect URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Invalid redirect URL");
  }
  const origin = parsed.origin;
  const allowed = getAllowedOrigins().some((o) => {
    try {
      return origin === new URL(o).origin;
    } catch {
      return false;
    }
  });
  if (!allowed) {
    throw new Error("Invalid redirect URL");
  }
}
