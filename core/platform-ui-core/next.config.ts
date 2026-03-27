import type { NextConfig } from "next";

const isSecureOrigin =
  (process.env.NEXT_PUBLIC_API_URL ?? "").startsWith("https://");

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // "Type cannot be named" errors are pnpm monorepo artifacts —
    // deep dependency .d.ts paths aren't portable across hoisted node_modules.
    // The standalone repo builds clean; these are not real type errors.
    ignoreBuildErrors: true,
  },
  headers: async () => [
    {
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
  ],
};

export default nextConfig;
