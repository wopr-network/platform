import type { NextConfig } from "next";

// All /api/* traffic goes to the holyship engine. The engine owns holyship
// routes (github, ship-it, engine, interrogation, etc.) and proxies everything
// else (auth, tRPC, products, stripe) to core.
const ENGINE_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@wopr-network/platform-ui-core"],
  images: {
    remotePatterns: [{ hostname: "**.githubusercontent.com" }, { hostname: "**.googleusercontent.com" }],
  },
  rewrites: async () => [
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
