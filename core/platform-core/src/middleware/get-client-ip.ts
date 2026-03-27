import type { Context } from "hono";

/**
 * Parse the TRUSTED_PROXY_IPS env var into a Set of IP addresses.
 * Returns an empty set if the value is undefined or empty.
 */
export function parseTrustedProxies(envValue: string | undefined): Set<string> {
  if (!envValue) return new Set();
  return new Set(
    envValue
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean),
  );
}

/** Strip IPv6-mapped-IPv4 prefix (::ffff:) for comparison. */
function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/**
 * Check whether an IPv4 address is in an RFC 1918 private range or loopback.
 * These are always behind a proxy in production (Docker, k8s, cloud VPCs)
 * so trusting X-Forwarded-For from them is safe and expected.
 *
 * Ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
 */
export function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  const a = Number.parseInt(parts[0], 10);
  const b = Number.parseInt(parts[1], 10);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

// Parsed once at module load — no per-request overhead.
const trustedProxies = parseTrustedProxies(process.env.TRUSTED_PROXY_IPS);

/**
 * Determine the real client IP.
 *
 * - If `socketAddr` matches a trusted proxy (explicit list OR RFC 1918
 *   private IP), use the **last** (rightmost) value from
 *   `X-Forwarded-For` (closest hop to the trusted proxy).
 * - Otherwise, use `socketAddr` directly (XFF is untrusted).
 * - Falls back to `"unknown"` if neither is available.
 */
export function getClientIp(
  xffHeader: string | undefined,
  socketAddr: string | undefined,
  trusted: Set<string> = trustedProxies,
): string {
  const normalizedSocket = socketAddr ? normalizeIp(socketAddr) : undefined;

  if (xffHeader && normalizedSocket && (trusted.has(normalizedSocket) || isPrivateIp(normalizedSocket))) {
    // Trust XFF — take the rightmost (last) value
    const parts = xffHeader.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }

  if (socketAddr) return socketAddr;
  return "unknown";
}

/**
 * Convenience wrapper: extract client IP from a Hono Context.
 * Reads XFF header and socket address from the request.
 * Optionally accepts a trusted proxy set (defaults to the module-level set
 * parsed from TRUSTED_PROXY_IPS — useful for testing).
 */
export function getClientIpFromContext(c: Context, trusted?: Set<string>): string {
  const xff = c.req.header("x-forwarded-for");
  const incoming = (c.env as Record<string, unknown>)?.incoming as { socket?: { remoteAddress?: string } } | undefined;
  const socketAddr = incoming?.socket?.remoteAddress;
  return trusted !== undefined ? getClientIp(xff, socketAddr, trusted) : getClientIp(xff, socketAddr);
}
