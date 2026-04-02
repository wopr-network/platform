import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@wopr-network/platform-ui-core"],
  images: {
    remotePatterns: [
      { hostname: "**.githubusercontent.com" },
      { hostname: "**.googleusercontent.com" },
    ],
  },
  rewrites: async () => ({
    beforeFiles: [
      // Proxy sidecar UI: /_sidecar/* → instance backend
      ...(process.env.INSTANCE_INTERNAL_URL
        ? [
            {
              source: "/_sidecar/:path*",
              destination: `${process.env.INSTANCE_INTERNAL_URL}/:path*`,
            },
            {
              source: "/_sidecar",
              destination: `${process.env.INSTANCE_INTERNAL_URL}/`,
            },
          ]
        : []),
    ],
    afterFiles: [],
    fallback: [],
  }),
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
