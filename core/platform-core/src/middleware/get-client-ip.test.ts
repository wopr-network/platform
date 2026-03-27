import { describe, expect, it } from "vitest";
import { getClientIp, isPrivateIp, parseTrustedProxies } from "./get-client-ip.js";

describe("parseTrustedProxies", () => {
  it("returns empty set for undefined", () => {
    expect(parseTrustedProxies(undefined).size).toBe(0);
  });

  it("returns empty set for empty string", () => {
    expect(parseTrustedProxies("").size).toBe(0);
  });

  it("parses comma-separated IPs", () => {
    const result = parseTrustedProxies("10.0.0.1, 10.0.0.2");
    expect(result.has("10.0.0.1")).toBe(true);
    expect(result.has("10.0.0.2")).toBe(true);
    expect(result.size).toBe(2);
  });
});

describe("isPrivateIp", () => {
  it("identifies 10.x.x.x as private", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
  });

  it("identifies 172.16-31.x.x as private", () => {
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.18.0.5")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
  });

  it("rejects 172.15.x.x and 172.32.x.x as non-private", () => {
    expect(isPrivateIp("172.15.0.1")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
  });

  it("identifies 192.168.x.x as private", () => {
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.100")).toBe(true);
  });

  it("identifies 127.x.x.x as private (loopback)", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
  });

  it("rejects public IPs", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.2.3.4")).toBe(false);
    expect(isPrivateIp("203.0.113.1")).toBe(false);
  });

  it("rejects non-IPv4 strings", () => {
    expect(isPrivateIp("::1")).toBe(false);
    expect(isPrivateIp("not-an-ip")).toBe(false);
  });
});

describe("getClientIp", () => {
  it("returns socket address when no trusted proxies configured", () => {
    expect(getClientIp("attacker-spoofed", "1.2.3.4", new Set())).toBe("1.2.3.4");
  });

  it("ignores XFF when socket is not in trusted proxy set", () => {
    const trusted = new Set(["10.0.0.1"]);
    expect(getClientIp("spoofed-ip", "9.9.9.9", trusted)).toBe("9.9.9.9");
  });

  it("trusts XFF rightmost value when socket is a trusted proxy", () => {
    const trusted = new Set(["10.0.0.1"]);
    expect(getClientIp("client-ip, 10.0.0.1", "10.0.0.1", trusted)).toBe("10.0.0.1");
  });

  it("uses rightmost XFF entry (closest to trusted proxy)", () => {
    const trusted = new Set(["10.0.0.1"]);
    expect(getClientIp("spoofed, real-client", "10.0.0.1", trusted)).toBe("real-client");
  });

  it("handles IPv6-mapped IPv4 socket addresses", () => {
    const trusted = new Set(["10.0.0.1"]);
    expect(getClientIp("client-ip", "::ffff:10.0.0.1", trusted)).toBe("client-ip");
  });

  it("returns 'unknown' when no socket and no XFF", () => {
    expect(getClientIp(undefined, undefined, new Set())).toBe("unknown");
  });

  it("auto-trusts private IPs even without explicit trusted proxy set", () => {
    expect(getClientIp("real-client", "172.18.0.5", new Set())).toBe("real-client");
    expect(getClientIp("real-client", "192.168.1.1", new Set())).toBe("real-client");
    expect(getClientIp("real-client", "10.0.0.1", new Set())).toBe("real-client");
  });

  it("auto-trusts IPv6-mapped private IPs", () => {
    expect(getClientIp("real-client", "::ffff:172.18.0.5", new Set())).toBe("real-client");
  });

  it("does NOT auto-trust public IPs without explicit proxy config", () => {
    expect(getClientIp("spoofed", "8.8.8.8", new Set())).toBe("8.8.8.8");
  });
});
