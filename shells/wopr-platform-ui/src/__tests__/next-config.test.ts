import { describe, expect, it } from "vitest";

// next.config.ts uses process.env at module evaluation time; import after setting env
process.env.NEXT_PUBLIC_API_URL = "";

// Dynamic import to allow env to be set first
const { default: nextConfig } = await import("../../next.config");

describe("next.config.ts headers()", () => {
  it("should not apply CSP to all routes via /:path*", async () => {
    const entries = await nextConfig.headers?.();
    const allRoutesEntry = entries?.find((e: { source: string }) => e.source === "/:path*");
    const cspOnAllRoutes = allRoutesEntry?.headers.find(
      (h: { key: string }) => h.key === "Content-Security-Policy",
    );
    expect(cspOnAllRoutes).toBeUndefined();
  });

  it("should apply CSP only to static asset paths", async () => {
    const entries = await nextConfig.headers?.();
    const sources = entries?.map((e: { source: string }) => e.source);
    expect(sources).toContain("/_next/static/:path*");
    expect(sources).toContain("/_next/image/:path*");
    expect(sources).toContain("/favicon.ico");
  });

  it("each static asset path entry should have a Content-Security-Policy header", async () => {
    const entries = await nextConfig.headers?.();
    for (const source of ["/_next/static/:path*", "/_next/image/:path*", "/favicon.ico"]) {
      const entry = entries?.find((e: { source: string }) => e.source === source);
      expect(entry, `missing entry for ${source}`).toBeDefined();
      const csp = entry?.headers.find((h: { key: string }) => h.key === "Content-Security-Policy");
      expect(csp, `missing CSP for ${source}`).toBeDefined();
    }
  });
});
