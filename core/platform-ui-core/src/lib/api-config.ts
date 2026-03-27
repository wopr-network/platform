/**
 * Centralized API base URL configuration.
 *
 * The API URL is derived at runtime from the hostname — no NEXT_PUBLIC_API_URL
 * env var needed. Convention: UI at `<domain>` → API at `api.<domain>`.
 * Staging: `staging.<domain>` → `staging.api.<domain>`.
 *
 * Falls back to NEXT_PUBLIC_API_URL if set (local dev), then localhost.
 */

import { getBrandConfig } from "./brand-config";

/**
 * Derive the platform API URL from the current hostname.
 * Works on both client (window.location) and server (brand config domain).
 */
function resolveApiUrl(): string {
  // 1. Explicit env var — local dev, tests, or override
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  // 2. Client-side: derive from browser hostname
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const proto = window.location.protocol;
    // localhost → local dev
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:3001";
    }
    // staging.X.com → staging.api.X.com
    if (host.startsWith("staging.")) {
      const base = host.replace(/^staging\./, "");
      return `${proto}//staging.api.${base}`;
    }
    // X.com → api.X.com
    return `${proto}//api.${host}`;
  }

  // 3. Server-side: derive from brand config domain
  const domain = getBrandConfig().domain;
  if (domain && domain !== "localhost" && domain.includes(".")) {
    return `https://api.${domain}`;
  }

  return "http://localhost:3001";
}

export const PLATFORM_BASE_URL = resolveApiUrl();

/** Base URL for REST API calls (platform root + /api). */
export const API_BASE_URL = `${PLATFORM_BASE_URL}/api`;

/** Canonical site URL for SEO metadata (sitemap, OG tags, robots). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${getBrandConfig().domain}`;
