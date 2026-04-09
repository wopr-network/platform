import type { NextConfig } from "next";

const ENGINE_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
const CORE_URL = process.env.INTERNAL_CORE_URL || "http://core:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@wopr-network/platform-ui-core"],
  rewrites: async () => [
    // BetterAuth lives on core. Route /api/auth/* directly to core — never
    // through the holyship engine, whose fetch proxy silently ate 302s and
    // stripped Set-Cookie on the OAuth callback. More specific rule must
    // come first so Next matches it before the generic engine rewrite.
    {
      source: "/api/auth/:path*",
      destination: `${CORE_URL}/api/auth/:path*`,
    },
    {
      source: "/api/:path*",
      destination: `${ENGINE_URL}/api/:path*`,
    },
  ],
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
};

export default nextConfig;
