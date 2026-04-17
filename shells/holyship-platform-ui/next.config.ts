import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@wopr-network/platform-ui-core"],
  images: {
    remotePatterns: [{ hostname: "**.githubusercontent.com" }, { hostname: "**.googleusercontent.com" }],
  },
  // All /api/* traffic goes to the holyship engine. The engine owns holyship
  // routes (github, ship-it, engine, interrogation, etc.) and proxies everything
  // else (auth, tRPC, products, stripe) to core. Resolve INTERNAL_API_URL inside
  // the rewrites function so `next start` reads the *runtime* Docker env, not a
  // stale build-time value baked into routes-manifest (which silently falls
  // back to localhost:3005 when the build arg is missing).
  rewrites: async () => {
    const engineUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
    return [
      {
        source: "/api/:path*",
        destination: `${engineUrl}/api/:path*`,
      },
    ];
  },
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
