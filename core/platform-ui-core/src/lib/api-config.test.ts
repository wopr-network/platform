import { afterEach, describe, expect, it, vi } from "vitest";

describe("api-config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  describe("URL resolution", () => {
    it("uses NEXT_PUBLIC_API_URL directly when set", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
      vi.resetModules();
      const mod = await import("./api-config");
      expect(mod.PLATFORM_BASE_URL).toBe("http://localhost:3001");
    });

    it("accepts https URL", async () => {
      vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com");
      vi.resetModules();
      const mod = await import("./api-config");
      expect(mod.PLATFORM_BASE_URL).toBe("https://api.example.com");
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
