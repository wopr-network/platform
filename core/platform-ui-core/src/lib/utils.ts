import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validate a redirect URL is a safe relative path.
 * Fully decodes percent-encoding (up to 5 iterations) then rejects
 * protocol-relative URLs ("//evil.com") and backslash-relative URLs ("/\evil.com").
 * Falls back to "/" for any unsafe value.
 */
export function sanitizeRedirectUrl(raw: string | null | undefined): string {
  if (!raw?.startsWith("/")) {
    return "/";
  }

  // Decode percent-encoding to catch bypass attempts like /%2F%2Fevil.com or /%5Cevil.com.
  // Loop because double-encoding is possible (/%252F → /%2F → //).
  // Cap iterations to prevent abuse via deeply nested encoding.
  // On URIError mid-loop, stop at the last stable decode — e.g. /100%25 → /100% is valid.
  const MAX_DECODE_ITERATIONS = 5;
  let decoded = raw;
  let iterations = 0;
  while (iterations < MAX_DECODE_ITERATIONS) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      // Malformed percent-encoding in remainder — stop at current stable value
      break;
    }
    if (next === decoded) {
      break;
    }
    decoded = next;
    iterations++;
  }
  if (iterations >= MAX_DECODE_ITERATIONS) {
    return "/";
  }

  if (decoded.startsWith("//") || decoded.startsWith("/\\")) {
    return "/";
  }

  return raw;
}
