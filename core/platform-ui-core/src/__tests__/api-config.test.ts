/**
 * Tests for api-config.ts — URL resolution behaviour.
 *
 * The module resolves API URL at import time, so each test
 * uses vi.resetModules() + a dynamic import to re-evaluate the module
 * with the desired environment variables.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("api-config URL resolution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("uses NEXT_PUBLIC_API_URL when set", async () => {
    setEnv({
      NEXT_PUBLIC_API_URL: "https://api.example.com",
    });
    const mod = await import("../lib/api-config");
    expect(mod.PLATFORM_BASE_URL).toBe("https://api.example.com");
    expect(mod.API_BASE_URL).toBe("https://api.example.com/api");
  });

  it("falls back to localhost:3001 when no env var and no window", async () => {
    setEnv({
      NEXT_PUBLIC_API_URL: undefined,
    });
    const mod = await import("../lib/api-config");
    // In test env (jsdom with localhost), should resolve to localhost
    expect(mod.PLATFORM_BASE_URL).toContain("localhost");
  });

  it("exports SITE_URL from NEXT_PUBLIC_SITE_URL env var", async () => {
    setEnv({
      NEXT_PUBLIC_SITE_URL: "https://mysite.com",
      NEXT_PUBLIC_API_URL: "http://localhost:3001",
    });
    const mod = await import("../lib/api-config");
    expect(mod.SITE_URL).toBe("https://mysite.com");
  });

  it("exports API_BASE_URL as PLATFORM_BASE_URL + /api", async () => {
    setEnv({
      NEXT_PUBLIC_API_URL: "https://api.test.com",
    });
    const mod = await import("../lib/api-config");
    expect(mod.API_BASE_URL).toBe(`${mod.PLATFORM_BASE_URL}/api`);
  });
});
