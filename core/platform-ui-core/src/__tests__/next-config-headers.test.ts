import { describe, expect, it } from "vitest";

describe("next.config headers", () => {
  it("exports headers function", async () => {
    const config = await import("../../next.config.js");
    const nextConfig = config.default;
    expect(typeof nextConfig.headers).toBe("function");

    const headers = await nextConfig.headers?.();
    if (!headers) throw new Error("headers() returned undefined");
    expect(headers).toHaveLength(1);
    expect(headers[0].source).toBe("/:path*");

    const headerMap = new Map(
      headers[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    );
    expect(headerMap.get("X-Frame-Options")).toBe("DENY");
    expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
    // CSP is now set exclusively by middleware (nonce-based), not next.config.ts
    expect(headerMap.get("Content-Security-Policy")).toBeUndefined();
    // HSTS is only set when NEXT_PUBLIC_API_URL is an https:// origin
    const hsts = headerMap.get("Strict-Transport-Security");
    if (hsts !== undefined) {
      expect(hsts).toContain("max-age=31536000");
    }
    expect(headerMap.get("Permissions-Policy")).toMatch(/camera|microphone|geolocation/);
  });
});
