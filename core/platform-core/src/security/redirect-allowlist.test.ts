import { describe, expect, it } from "vitest";
import { assertSafeRedirectUrl, registerAllowedOrigins } from "./redirect-allowlist.js";

// Simulate what boot does — register product domains
registerAllowedOrigins(["https://app.wopr.bot", "https://wopr.network"]);

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

  describe("dynamic registration", () => {
    it("allows dynamically registered origins", () => {
      registerAllowedOrigins(["https://staging.wopr.bot"]);
      expect(() => assertSafeRedirectUrl("https://staging.wopr.bot/billing")).not.toThrow();
    });

    it("allows multiple registered origins", () => {
      registerAllowedOrigins(["https://preview.wopr.bot", "https://platform.example.com"]);
      expect(() => assertSafeRedirectUrl("https://preview.wopr.bot/dashboard")).not.toThrow();
      expect(() => assertSafeRedirectUrl("https://platform.example.com/dashboard")).not.toThrow();
    });

    it("rejects unregistered origins", () => {
      expect(() => assertSafeRedirectUrl("https://random.example.org")).toThrow("Invalid redirect URL");
    });
  });
});
