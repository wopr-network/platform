/** Origins that are always allowed as redirect targets from checkout responses. */
const STATIC_ALLOWED_ORIGINS: readonly string[] = [
  "https://checkout.stripe.com",
  "https://billing.stripe.com",
];

/**
 * Build the full allowed origins set, including any configured BTCPay Server origin.
 * BTCPay is self-hosted so its URL varies per deployment — read from env var.
 */
function getAllowedOrigins(): ReadonlySet<string> {
  const origins = new Set(STATIC_ALLOWED_ORIGINS);

  // BTCPay Server (self-hosted, URL varies per deployment)
  const btcpayUrl = process.env.NEXT_PUBLIC_BTCPAY_URL?.trim();
  if (btcpayUrl) {
    try {
      origins.add(new URL(btcpayUrl).origin);
    } catch (_err) {
      // Invalid URL — skip silently; BTCPay checkout will fall back to same-origin
    }
  }

  return origins;
}

export const ALLOWED_REDIRECT_ORIGINS: ReadonlySet<string> = getAllowedOrigins();

/**
 * Returns true if `url` is safe to navigate to.
 * Allowed: same-origin, or origin is in ALLOWED_REDIRECT_ORIGINS.
 * Rejects: non-http(s) schemes, relative URLs that could be abused, unknown origins.
 */
export function isAllowedRedirectUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    return false;
  }

  // Only http(s) schemes
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }

  // Same-origin is always allowed
  if (parsed.origin === window.location.origin) {
    return true;
  }

  return ALLOWED_REDIRECT_ORIGINS.has(parsed.origin);
}
