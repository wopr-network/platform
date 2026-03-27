/**
 * Tests for api-config.ts — validateProductionApiUrl guard behaviour.
 *
 * The module throws at import time if validation fails, so each test
 * uses vi.resetModules() + a dynamic import to re-evaluate the module
 * with the desired environment variables.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_PRODUCTION_URL = "https://api.example.com";
const INTERNAL_URL = "http://localhost:3001";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("validateProductionApiUrl", () => {
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

  it("does NOT throw in development regardless of URL", async () => {
    setEnv({
      NODE_ENV: "development",
      NEXT_RUNTIME: undefined,
      NEXT_PHASE: undefined,
      NEXT_PUBLIC_API_URL: INTERNAL_URL,
    });
    await expect(import("../lib/api-config")).resolves.toHaveProperty("API_BASE_URL");
  });

  it("does NOT throw during the Next.js build phase (NEXT_PHASE=phase-production-build)", async () => {
    // This is the key regression test: CI sets NODE_ENV=production and
    // NEXT_PUBLIC_API_URL=http://localhost:3001. The build must not crash.
    setEnv({
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
      NEXT_RUNTIME: "nodejs",
      NEXT_PUBLIC_API_URL: INTERNAL_URL,
    });
    await expect(import("../lib/api-config")).resolves.toHaveProperty("API_BASE_URL");
  });

  it("throws at production runtime with an internal URL", async () => {
    setEnv({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      NEXT_RUNTIME: "nodejs",
      NEXT_PUBLIC_API_URL: INTERNAL_URL,
    });
    await expect(import("../lib/api-config")).rejects.toThrow(/contains an internal hostname/);
  });

  it("throws at production runtime when NEXT_PUBLIC_API_URL is not set", async () => {
    setEnv({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      NEXT_RUNTIME: "nodejs",
      NEXT_PUBLIC_API_URL: undefined,
    });
    await expect(import("../lib/api-config")).rejects.toThrow(/NEXT_PUBLIC_API_URL is not set/);
  });

  it("does NOT throw at production runtime with a valid public HTTPS URL", async () => {
    setEnv({
      NODE_ENV: "production",
      NEXT_PHASE: undefined,
      NEXT_RUNTIME: "nodejs",
      NEXT_PUBLIC_API_URL: VALID_PRODUCTION_URL,
    });
    await expect(import("../lib/api-config")).resolves.toHaveProperty("API_BASE_URL");
  });
});
