import { beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_REDIRECT_ORIGINS, isAllowedRedirectUrl } from "@/lib/validate-redirect-url";

describe("isAllowedRedirectUrl", () => {
  beforeEach(() => {
    // Ensure window.location is set to a real origin for same-origin tests
    Object.defineProperty(window, "location", {
      value: { href: "http://localhost/", origin: "http://localhost" },
      writable: true,
      configurable: true,
    });
  });

  it("allows Stripe checkout URLs", () => {
    expect(isAllowedRedirectUrl("https://checkout.stripe.com/c/pay_abc123")).toBe(true);
  });

  it("allows Stripe billing portal URLs", () => {
    expect(isAllowedRedirectUrl("https://billing.stripe.com/p/session/test_abc")).toBe(true);
  });

  it("allows same-origin URLs (BTCPay checkout is same-origin in local dev)", () => {
    expect(isAllowedRedirectUrl("http://localhost/billing/success")).toBe(true);
    expect(isAllowedRedirectUrl("http://localhost/i/invoice123")).toBe(true);
    expect(isAllowedRedirectUrl("/billing/success")).toBe(true);
  });

  it("blocks unknown origins", () => {
    expect(isAllowedRedirectUrl("https://evil.com/steal-creds")).toBe(false);
  });

  it("blocks javascript: URLs", () => {
    expect(isAllowedRedirectUrl("javascript:alert(1)")).toBe(false);
  });

  it("blocks data: URLs", () => {
    expect(isAllowedRedirectUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("blocks empty string", () => {
    expect(isAllowedRedirectUrl("")).toBe(false);
  });

  it("blocks Stripe subdomain spoofing", () => {
    expect(isAllowedRedirectUrl("https://checkout.stripe.com.evil.com/pay")).toBe(false);
  });

  it("exports the allowlist set", () => {
    expect(ALLOWED_REDIRECT_ORIGINS).toBeInstanceOf(Set);
    expect(ALLOWED_REDIRECT_ORIGINS.has("https://checkout.stripe.com")).toBe(true);
  });

  it("does not include defunct payment providers", () => {
    expect(ALLOWED_REDIRECT_ORIGINS.has("https://payram.io")).toBe(false);
  });
});
