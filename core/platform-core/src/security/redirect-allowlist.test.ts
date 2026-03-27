import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertSafeRedirectUrl } from "./redirect-allowlist.js";

describe("assertSafeRedirectUrl", () => {
  it("allows https://app.wopr.bot paths", () => {
    expect(() => assertSafeRedirectUrl("https://app.wopr.bot/billing/success")).not.toThrow();
  });

  it("allows https://app.wopr.bot with query params", () => {
    expect(() => assertSafeRedirectUrl("https://app.wopr.bot/dashboard?vps=activated")).not.toThrow();
  });

  it("allows https://wopr.network paths", () => {
    expect(() => assertSafeRedirectUrl("https://wopr.network/welcome")).not.toThrow();
  });

  it("allows http://localhost:3000 in dev", () => {
    expect(() => assertSafeRedirectUrl("http://localhost:3000/billing")).not.toThrow();
  });

  it("allows http://localhost:3001 in dev", () => {
    expect(() => assertSafeRedirectUrl("http://localhost:3001/billing")).not.toThrow();
  });

  it("rejects external domains", () => {
    expect(() => assertSafeRedirectUrl("https://evil.com/phishing")).toThrow("Invalid redirect URL");
  });

  it("rejects subdomain spoofing (app.wopr.bot.evil.com)", () => {
    expect(() => assertSafeRedirectUrl("https://app.wopr.bot.evil.com/phishing")).toThrow("Invalid redirect URL");
  });

  it("rejects non-URL strings", () => {
    expect(() => assertSafeRedirectUrl("not-a-url")).toThrow("Invalid redirect URL");
  });

  it("rejects javascript: URIs", () => {
    expect(() => assertSafeRedirectUrl("javascript:alert(1)")).toThrow("Invalid redirect URL");
  });

  it("rejects data: URIs", () => {
    expect(() => assertSafeRedirectUrl("data:text/html,<h1>pwned</h1>")).toThrow("Invalid redirect URL");
  });

  it("rejects empty string", () => {
    expect(() => assertSafeRedirectUrl("")).toThrow("Invalid redirect URL");
  });

  it("rejects https://example.com", () => {
    expect(() => assertSafeRedirectUrl("https://example.com/callback")).toThrow("Invalid redirect URL");
  });

  describe("EXTRA_ALLOWED_REDIRECT_ORIGINS env-driven entries", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    afterEach(() => {
      delete process.env.EXTRA_ALLOWED_REDIRECT_ORIGINS;
      vi.resetModules();
    });

    it("allows origins listed in EXTRA_ALLOWED_REDIRECT_ORIGINS", async () => {
      process.env.EXTRA_ALLOWED_REDIRECT_ORIGINS = "https://staging.wopr.bot";
      const { assertSafeRedirectUrl: assertSafe } = await import("./redirect-allowlist.js");
      expect(() => assertSafe("https://staging.wopr.bot/billing")).not.toThrow();
    });

    it("allows multiple comma-separated origins", async () => {
      process.env.EXTRA_ALLOWED_REDIRECT_ORIGINS = "https://staging.wopr.bot,https://preview.wopr.bot";
      const { assertSafeRedirectUrl: assertSafe } = await import("./redirect-allowlist.js");
      expect(() => assertSafe("https://staging.wopr.bot/billing")).not.toThrow();
      expect(() => assertSafe("https://preview.wopr.bot/dashboard")).not.toThrow();
    });

    it("ignores empty/whitespace entries in comma-separated list", async () => {
      process.env.EXTRA_ALLOWED_REDIRECT_ORIGINS = "https://staging.wopr.bot, , ,";
      const { assertSafeRedirectUrl: assertSafe } = await import("./redirect-allowlist.js");
      expect(() => assertSafe("https://staging.wopr.bot/billing")).not.toThrow();
      expect(() => assertSafe("https://evil.com/phishing")).toThrow("Invalid redirect URL");
    });

    it("defaults to empty when env var is unset", async () => {
      delete process.env.EXTRA_ALLOWED_REDIRECT_ORIGINS;
      const { assertSafeRedirectUrl: assertSafe } = await import("./redirect-allowlist.js");
      expect(() => assertSafe("https://random.example.org")).toThrow("Invalid redirect URL");
    });
  });

  describe("PLATFORM_UI_URL env-driven entry", () => {
    beforeEach(() => {
      process.env.PLATFORM_UI_URL = "https://platform.example.com";
      vi.resetModules();
    });

    afterEach(() => {
      delete process.env.PLATFORM_UI_URL;
      vi.resetModules();
    });

    it("allows PLATFORM_UI_URL when set", async () => {
      const { assertSafeRedirectUrl: assertSafe } = await import("./redirect-allowlist.js");
      expect(() => assertSafe("https://platform.example.com/dashboard")).not.toThrow();
    });

    it("rejects URLs not matching PLATFORM_UI_URL", async () => {
      const { assertSafeRedirectUrl: assertSafe } = await import("./redirect-allowlist.js");
      expect(() => assertSafe("https://other.example.com/dashboard")).toThrow("Invalid redirect URL");
    });
  });
});
