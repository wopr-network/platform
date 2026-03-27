import { describe, expect, it } from "vitest";
import { sanitizeRedirectUrl } from "@/lib/utils";

describe("sanitizeRedirectUrl", () => {
  it("allows valid relative paths", () => {
    expect(sanitizeRedirectUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirectUrl("/settings")).toBe("/settings");
    expect(sanitizeRedirectUrl("/settings/profile")).toBe("/settings/profile");
  });

  it("rejects absolute URLs to external origins", () => {
    expect(sanitizeRedirectUrl("https://evil.com/phishing")).toBe("/");
    expect(sanitizeRedirectUrl("http://evil.com")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeRedirectUrl("//evil.com")).toBe("/");
    expect(sanitizeRedirectUrl("//evil.com/path")).toBe("/");
  });

  it("rejects percent-encoded protocol-relative URLs (bypass attempt)", () => {
    expect(sanitizeRedirectUrl("/%2F%2Fevil.com")).toBe("/");
    expect(sanitizeRedirectUrl("/%2f%2fevil.com")).toBe("/");
    expect(sanitizeRedirectUrl("/%2F/evil.com")).toBe("/");
    expect(sanitizeRedirectUrl("/%252F%252Fevil.com")).toBe("/");
  });

  it("rejects backslash-relative URLs", () => {
    expect(sanitizeRedirectUrl("/\\evil.com")).toBe("/");
    expect(sanitizeRedirectUrl("/%5Cevil.com")).toBe("/");
  });

  it("returns / when decode loop exceeds max iterations", () => {
    // Build a string with deeply nested encoding that requires >5 rounds to decode
    let tail = "//evil.com";
    for (let i = 0; i < 10; i++) {
      tail = encodeURIComponent(tail);
    }
    const deeplyEncoded = `/${tail}`;
    expect(sanitizeRedirectUrl(deeplyEncoded)).toBe("/");
  });

  it("allows valid paths with percent-encoded characters (no false rejection)", () => {
    // /100%25 decodes to /100% — a literal % sign, not a bypass — must not be rejected
    expect(sanitizeRedirectUrl("/100%25")).toBe("/100%25");
  });

  it("falls back to / for null and undefined", () => {
    expect(sanitizeRedirectUrl(null)).toBe("/");
    expect(sanitizeRedirectUrl(undefined)).toBe("/");
  });

  it("falls back to / for empty string", () => {
    expect(sanitizeRedirectUrl("")).toBe("/");
  });

  it("allows root path", () => {
    expect(sanitizeRedirectUrl("/")).toBe("/");
  });

  it("allows paths with query strings", () => {
    expect(sanitizeRedirectUrl("/settings?tab=billing")).toBe("/settings?tab=billing");
  });
});

// This test documents the fix — signup previously passed raw callbackUrl to OAuthButtons
describe("signup page callbackUrl sanitization", () => {
  it("sanitizeRedirectUrl rejects external URLs that could be passed as callbackUrl", () => {
    // Before fix: searchParams.get("callbackUrl") ?? "/" was passed directly
    // After fix: sanitizeRedirectUrl(searchParams.get("callbackUrl")) is used
    const maliciousParam = "https://evil.com/phishing";
    expect(sanitizeRedirectUrl(maliciousParam)).toBe("/");
  });
});
