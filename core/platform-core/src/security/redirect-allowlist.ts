const STATIC_ORIGINS: string[] = ["https://app.wopr.bot", "https://wopr.network"];

function parseExtraOrigins(): string[] {
  const raw = process.env.EXTRA_ALLOWED_REDIRECT_ORIGINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((entry) => {
      try {
        new URL(entry);
        return true;
      } catch {
        console.warn(`[redirect-allowlist] Malformed entry in EXTRA_ALLOWED_REDIRECT_ORIGINS, skipping: ${entry}`);
        return false;
      }
    });
}

function getAllowedOrigins(): string[] {
  return [
    ...STATIC_ORIGINS,
    ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://localhost:3001"] : []),
    ...(process.env.PLATFORM_UI_URL ? [process.env.PLATFORM_UI_URL] : []),
    ...(process.env.NODE_ENV !== "production" ? parseExtraOrigins() : []),
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
