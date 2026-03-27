import { afterEach, describe, expect, it, vi } from "vitest";

describe("api-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("production URL validation", () => {
    it("throws when NEXT_PUBLIC_API_URL contains localhost in production runtime", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
      vi.resetModules();
      await expect(import("./api-config")).rejects.toThrow(/internal hostname/i);
    });

    it("throws when NEXT_PUBLIC_API_URL contains a Docker-internal hostname in production runtime", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "http://platform-api:3001");
      vi.resetModules();
      await expect(import("./api-config")).rejects.toThrow(/internal hostname/i);
    });

    it("throws when NEXT_PUBLIC_API_URL is unset in production runtime", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      vi.stubEnv("NEXT_PUBLIC_API_URL", undefined as unknown as string);
      vi.resetModules();
      await expect(import("./api-config")).rejects.toThrow(/internal hostname/i);
    });

    it("throws when NEXT_PUBLIC_API_URL uses http (not https) in production runtime", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.example.com");
      vi.resetModules();
      await expect(import("./api-config")).rejects.toThrow(/https/i);
    });

    it("allows https public URL in production runtime", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
      vi.resetModules();
      const mod = await import("./api-config");
      expect(mod.PLATFORM_BASE_URL).toBe("https://api.example.com");
    });

    it("skips validation during build time (no NEXT_RUNTIME)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_RUNTIME", undefined as unknown as string);
      vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
      vi.resetModules();
      const mod = await import("./api-config");
      expect(mod.PLATFORM_BASE_URL).toBe("http://localhost:3001");
    });

    it("skips validation in development", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_RUNTIME", "nodejs");
      vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
      vi.resetModules();
      const mod = await import("./api-config");
      expect(mod.PLATFORM_BASE_URL).toBe("http://localhost:3001");
    });
  });

  it("uses default PLATFORM_BASE_URL when env is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined as unknown as string);
    vi.resetModules();
    const { PLATFORM_BASE_URL } = await import("./api-config");
    expect(PLATFORM_BASE_URL).toBe("http://localhost:3001");
  });

  it("uses NEXT_PUBLIC_API_URL when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    vi.resetModules();
    const { PLATFORM_BASE_URL } = await import("./api-config");
    expect(PLATFORM_BASE_URL).toBe("https://api.example.com");
  });

  it("derives API_BASE_URL from PLATFORM_BASE_URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
    vi.resetModules();
    const { API_BASE_URL } = await import("./api-config");
    expect(API_BASE_URL).toBe("https://api.example.com/api");
  });

  it("uses default API_BASE_URL when env not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined as unknown as string);
    vi.resetModules();
    const { API_BASE_URL } = await import("./api-config");
    expect(API_BASE_URL).toBe("http://localhost:3001/api");
  });

  it("uses default SITE_URL when env is not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined as unknown as string);
    vi.resetModules();
    const { SITE_URL } = await import("./api-config");
    expect(SITE_URL).toBe("https://localhost");
  });

  it("uses NEXT_PUBLIC_SITE_URL when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.example.com");
    vi.resetModules();
    const { SITE_URL } = await import("./api-config");
    expect(SITE_URL).toBe("https://staging.example.com");
  });
});
