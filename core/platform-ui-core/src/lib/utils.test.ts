import { describe, expect, it } from "vitest";
import { cn, sanitizeRedirectUrl } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("deduplicates tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });
});

describe("sanitizeRedirectUrl", () => {
  it("accepts safe relative paths", () => {
    expect(sanitizeRedirectUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeRedirectUrl("/settings/account")).toBe("/settings/account");
  });

  it("accepts paths with query strings", () => {
    expect(sanitizeRedirectUrl("/foo?bar=1")).toBe("/foo?bar=1");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeRedirectUrl("//evil.com")).toBe("/");
  });

  it("rejects percent-encoded protocol-relative URLs", () => {
    expect(sanitizeRedirectUrl("/%2F%2Fevil.com")).toBe("/");
    expect(sanitizeRedirectUrl("/%2f%2fevil.com")).toBe("/");
  });

  it("rejects double-encoded protocol-relative URLs", () => {
    expect(sanitizeRedirectUrl("/%252F%252Fevil.com")).toBe("/");
  });

  it("rejects absolute URLs", () => {
    expect(sanitizeRedirectUrl("https://evil.com")).toBe("/");
  });

  it("rejects bare strings without leading slash", () => {
    expect(sanitizeRedirectUrl("dashboard")).toBe("/");
  });

  it("returns / for null", () => {
    expect(sanitizeRedirectUrl(null)).toBe("/");
  });

  it("returns / for undefined", () => {
    expect(sanitizeRedirectUrl(undefined)).toBe("/");
  });

  it("returns / for empty string", () => {
    expect(sanitizeRedirectUrl("")).toBe("/");
  });
});
