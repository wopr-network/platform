import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRouteTable } from "../proxy/route-table.js";
import { buildUpstreamHeaders, extractTenantSubdomain } from "../proxy/tenant-proxy.js";

const DEFAULT_RESERVED = new Set(["app", "api", "staging", "www", "mail", "admin", "dashboard", "status", "docs"]);

describe("extractTenantSubdomain", () => {
  it("extracts valid subdomain", () => {
    expect(extractTenantSubdomain("alice.example.com", "example.com", DEFAULT_RESERVED)).toBe("alice");
  });

  it("returns null for root domain", () => {
    expect(extractTenantSubdomain("example.com", "example.com", DEFAULT_RESERVED)).toBeNull();
  });

  it("returns null for reserved subdomains", () => {
    expect(extractTenantSubdomain("app.example.com", "example.com", DEFAULT_RESERVED)).toBeNull();
    expect(extractTenantSubdomain("admin.example.com", "example.com", DEFAULT_RESERVED)).toBeNull();
  });

  it("returns null for wrong domain", () => {
    expect(extractTenantSubdomain("alice.evil.com", "example.com", DEFAULT_RESERVED)).toBeNull();
  });

  it("returns null for sub-sub-domains", () => {
    expect(extractTenantSubdomain("a.b.example.com", "example.com", DEFAULT_RESERVED)).toBeNull();
  });

  it("strips port", () => {
    expect(extractTenantSubdomain("alice.example.com:3200", "example.com", DEFAULT_RESERVED)).toBe("alice");
  });

  it("rejects invalid DNS labels", () => {
    expect(extractTenantSubdomain("-bad.example.com", "example.com", DEFAULT_RESERVED)).toBeNull();
    expect(extractTenantSubdomain("bad-.example.com", "example.com", DEFAULT_RESERVED)).toBeNull();
  });
});

describe("buildUpstreamHeaders", () => {
  it("forwards allowlisted headers and injects identity headers", () => {
    const incoming = new Headers({
      "content-type": "application/json",
      authorization: "Bearer secret",
      "x-request-id": "req-123",
    });

    const result = buildUpstreamHeaders(incoming, "user-1", "alice", ["content-type", "x-request-id"], "myapp");

    expect(result.get("content-type")).toBe("application/json");
    expect(result.get("x-request-id")).toBe("req-123");
    expect(result.get("x-myapp-user-id")).toBe("user-1");
    expect(result.get("x-myapp-tenant")).toBe("alice");
    expect(result.get("authorization")).toBeNull();
  });
});

describe("MemoryRouteTable", () => {
  let table: MemoryRouteTable;

  beforeEach(() => {
    table = new MemoryRouteTable();
  });

  it("registers and resolves", async () => {
    table.register("alice", "http://10.0.0.5:3100");
    expect(await table.resolve("alice")).toBe("http://10.0.0.5:3100");
  });

  it("returns null for unknown", async () => {
    expect(await table.resolve("unknown")).toBeNull();
  });

  it("returns null for unhealthy", async () => {
    table.register("bob", "http://10.0.0.6:3100");
    table.setHealth("bob", false);
    expect(await table.resolve("bob")).toBeNull();
  });

  it("removes routes", async () => {
    table.register("charlie", "http://10.0.0.7:3100");
    table.remove("charlie");
    expect(await table.resolve("charlie")).toBeNull();
  });

  it("lists all routes", () => {
    table.register("d1", "http://10.0.0.8:3100");
    table.register("d2", "http://10.0.0.9:3100");
    expect(table.list()).toHaveLength(2);
  });
});
