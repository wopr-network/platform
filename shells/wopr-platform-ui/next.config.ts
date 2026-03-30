import type { NextConfig } from "next";

const isSecureOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "").startsWith("https://");

const staticCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

const staticCspHeader = { key: "Content-Security-Policy", value: staticCsp };

// Static asset paths that the middleware (src/proxy.ts) explicitly excludes from its matcher.
// We apply a strict fallback CSP only to these paths so the nonce-based CSP set by middleware
// on app routes is not overridden by the more restrictive static policy.
const staticAssetPaths = ["/_next/static/:path*", "/_next/image/:path*", "/favicon.ico"];

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@wopr-network/platform-ui-core"],
  headers: async () => [
    {
      // Non-CSP security headers applied to all routes.
      // CSP is intentionally excluded here — middleware (src/proxy.ts) sets a nonce-based
      // CSP on every app route. If we also set a static CSP on /:path*, browsers would
      // enforce both headers (most restrictive wins), breaking nonce-gated scripts,
      // Stripe JS, and cross-origin API calls.
      source: "/:path*",
      headers: [
        ...(isSecureOrigin
          ? [
              {
                key: "Strict-Transport-Security",
                value: "max-age=31536000; includeSubDomains; preload",
              },
            ]
          : []),
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "X-DNS-Prefetch-Control",
          value: "off",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        },
      ],
    },
    // Apply a strict static CSP only to static asset paths. These paths are excluded from
    // the middleware matcher so they never receive the nonce-based CSP — the fallback
    // header here ensures they still have a restrictive policy.
    ...staticAssetPaths.map((source) => ({
      source,
      headers: [staticCspHeader],
    })),
  ],
};

export default nextConfig;
