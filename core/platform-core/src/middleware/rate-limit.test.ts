/**
 * Unit tests for rate-limit middleware factories.
 *
 * Only tests the generic rateLimit() and rateLimitByRoute() factories.
 * Platform-specific rules (platformRateLimitRules) remain in wopr-platform.
 */
import type { PGlite } from "@electric-sql/pglite";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformDb } from "../db/index.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { DrizzleRateLimitRepository } from "./drizzle-rate-limit-repository.js";
import {
  getClientIp,
  parseTrustedProxies,
  type RateLimitConfig,
  type RateLimitRule,
  rateLimit,
  rateLimitByRoute,
} from "./rate-limit.js";
import type { IRateLimitRepository } from "./rate-limit-repository.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Hono app with a single rate-limited GET /test route. */
function buildApp(cfg: Omit<RateLimitConfig, "repo" | "scope">, repo: IRateLimitRepository) {
  const app = new Hono();
  app.use("/test", rateLimit({ ...cfg, repo, scope: "test" }));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

function req(path = "/test", ip = "127.0.0.1") {
  return new Request(`http://localhost${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

function postReq(path: string, ip = "127.0.0.1") {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

// ---------------------------------------------------------------------------
// Shared PGlite instance (one pool for the entire file)
// ---------------------------------------------------------------------------

let pool: PGlite;
let db: PlatformDb;

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

// ---------------------------------------------------------------------------
// rateLimit (single-route)
// ---------------------------------------------------------------------------

describe("rateLimit", () => {
  let repo: IRateLimitRepository;

  beforeEach(async () => {
    vi.useFakeTimers();
    await truncateAllTables(pool);
    repo = new DrizzleRateLimitRepository(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", async () => {
    const app = buildApp({ max: 3 }, repo);

    for (let i = 0; i < 3; i++) {
      const res = await app.request(req());
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 when limit is exceeded", async () => {
    const app = buildApp({ max: 2 }, repo);

    await app.request(req());
    await app.request(req());
    const res = await app.request(req());

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Too many requests");
  });

  it("sets X-RateLimit-* headers on every response", async () => {
    const app = buildApp({ max: 5 }, repo);
    const res = await app.request(req());

    expect(res.headers.get("X-RateLimit-Limit")).toBe("5");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("4");
    expect(res.headers.get("X-RateLimit-Reset")).toMatch(/^\d+$/);
  });

  it("sets Retry-After header on 429", async () => {
    const app = buildApp({ max: 1 }, repo);

    await app.request(req());
    const res = await app.request(req());

    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toEqual(expect.any(String));
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it("resets the window after windowMs elapses", async () => {
    const app = buildApp({ max: 1, windowMs: 10_000 }, repo);

    const res1 = await app.request(req());
    expect(res1.status).toBe(200);

    const res2 = await app.request(req());
    expect(res2.status).toBe(429);

    vi.advanceTimersByTime(10_001);

    const res3 = await app.request(req());
    expect(res3.status).toBe(200);
  });

  it("tracks different IPs independently", async () => {
    const app = new Hono();
    app.use(
      "/test",
      rateLimit({ max: 1, repo, scope: "test", keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "unknown" }),
    );
    app.get("/test", (c) => c.json({ ok: true }));

    const res1 = await app.request(req("/test", "10.0.0.1"));
    expect(res1.status).toBe(200);

    const res2 = await app.request(req("/test", "10.0.0.2"));
    expect(res2.status).toBe(200);

    const res3 = await app.request(req("/test", "10.0.0.1"));
    expect(res3.status).toBe(429);
  });

  it("uses a custom message when provided", async () => {
    const app = buildApp({ max: 1, message: "Slow down" }, repo);

    await app.request(req());
    const res = await app.request(req());

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("Slow down");
  });

  it("supports custom key generator", async () => {
    const app = new Hono();
    app.use(
      "/test",
      rateLimit({ max: 1, repo, scope: "api-key", keyGenerator: (c) => c.req.header("x-api-key") ?? "anon" }),
    );
    app.get("/test", (c) => c.json({ ok: true }));

    const r1 = new Request("http://localhost/test", { headers: { "x-api-key": "key-a" } });
    const r2 = new Request("http://localhost/test", { headers: { "x-api-key": "key-b" } });
    const r3 = new Request("http://localhost/test", { headers: { "x-api-key": "key-a" } });

    expect((await app.request(r1)).status).toBe(200);
    expect((await app.request(r2)).status).toBe(200);
    expect((await app.request(r3)).status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// rateLimitByRoute (multi-route)
// ---------------------------------------------------------------------------

describe("rateLimitByRoute", () => {
  let repo: IRateLimitRepository;

  beforeEach(async () => {
    vi.useFakeTimers();
    await truncateAllTables(pool);
    repo = new DrizzleRateLimitRepository(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies rule-specific limits based on path prefix", async () => {
    const rules: RateLimitRule[] = [{ method: "POST", pathPrefix: "/strict", config: { max: 1 }, scope: "strict" }];
    const app = new Hono();
    app.use("*", rateLimitByRoute(rules, { max: 100 }, repo));
    app.post("/strict", (c) => c.json({ ok: true }));
    app.get("/lenient", (c) => c.json({ ok: true }));

    expect((await app.request(postReq("/strict"))).status).toBe(200);
    expect((await app.request(postReq("/strict"))).status).toBe(429);
    expect((await app.request(req("/lenient"))).status).toBe(200);
  });

  it("falls back to default config when no rule matches", async () => {
    const rules: RateLimitRule[] = [{ method: "POST", pathPrefix: "/special", config: { max: 1 }, scope: "special" }];
    const app = new Hono();
    app.use("*", rateLimitByRoute(rules, { max: 2 }, repo));
    app.get("/other", (c) => c.json({ ok: true }));

    expect((await app.request(req("/other"))).status).toBe(200);
    expect((await app.request(req("/other"))).status).toBe(200);
    expect((await app.request(req("/other"))).status).toBe(429);
  });

  it("matches method correctly (wildcard vs specific)", async () => {
    const rules: RateLimitRule[] = [
      { method: "*", pathPrefix: "/any-method", config: { max: 1 }, scope: "any-method" },
      { method: "GET", pathPrefix: "/get-only", config: { max: 1 }, scope: "get-only" },
    ];
    const app = new Hono();
    app.use("*", rateLimitByRoute(rules, { max: 100 }, repo));
    app.get("/any-method", (c) => c.json({ ok: true }));
    app.post("/any-method", (c) => c.json({ ok: true }));
    app.get("/get-only", (c) => c.json({ ok: true }));
    app.post("/get-only", (c) => c.json({ ok: true }));

    expect((await app.request(req("/any-method"))).status).toBe(200);
    expect((await app.request(postReq("/any-method"))).status).toBe(429);
    expect((await app.request(req("/get-only"))).status).toBe(200);
    expect((await app.request(req("/get-only"))).status).toBe(429);
    expect((await app.request(postReq("/get-only"))).status).toBe(200);
  });

  it("first matching rule wins", async () => {
    const rules: RateLimitRule[] = [
      { method: "POST", pathPrefix: "/api/billing/checkout", config: { max: 2 }, scope: "billing:checkout" },
      { method: "POST", pathPrefix: "/api/billing", config: { max: 100 }, scope: "billing" },
    ];
    const app = new Hono();
    app.use("*", rateLimitByRoute(rules, { max: 100 }, repo));
    app.post("/api/billing/checkout", (c) => c.json({ ok: true }));

    expect((await app.request(postReq("/api/billing/checkout"))).status).toBe(200);
    expect((await app.request(postReq("/api/billing/checkout"))).status).toBe(200);
    expect((await app.request(postReq("/api/billing/checkout"))).status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// Trusted proxy validation
// ---------------------------------------------------------------------------

describe("trusted proxy validation", () => {
  let repo: IRateLimitRepository;

  beforeEach(async () => {
    vi.useFakeTimers();
    await truncateAllTables(pool);
    repo = new DrizzleRateLimitRepository(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-trusts private IPs even when TRUSTED_PROXY_IPS is not set", () => {
    const trusted = parseTrustedProxies(undefined);
    expect(trusted.size).toBe(0);

    // Private IPs are auto-trusted — XFF is used
    const ip = getClientIp("spoofed-ip", "192.168.1.100", trusted);
    expect(ip).toBe("spoofed-ip");
  });

  it("ignores X-Forwarded-For from public IPs when TRUSTED_PROXY_IPS is not set", () => {
    const trusted = parseTrustedProxies(undefined);
    const ip = getClientIp("spoofed-ip", "203.0.113.1", trusted);
    expect(ip).toBe("203.0.113.1");
  });

  it("trusts X-Forwarded-For when socket address is in TRUSTED_PROXY_IPS", () => {
    const trusted = parseTrustedProxies("172.18.0.5,10.0.0.1");
    expect(trusted.size).toBe(2);

    const ip = getClientIp("real-client-ip", "172.18.0.5", trusted);
    expect(ip).toBe("real-client-ip");
  });

  it("strips ::ffff: prefix when matching trusted proxies", () => {
    const trusted = parseTrustedProxies("172.18.0.5");

    const ip = getClientIp("real-client-ip", "::ffff:172.18.0.5", trusted);
    expect(ip).toBe("real-client-ip");
  });

  it("falls back to socket address when socket is not a trusted proxy", () => {
    const trusted = parseTrustedProxies("172.18.0.5");

    const ip = getClientIp("spoofed-ip", "evil-direct-client", trusted);
    expect(ip).toBe("evil-direct-client");
  });

  it("uses last XFF value (rightmost) when proxy is trusted", () => {
    const trusted = parseTrustedProxies("172.18.0.5");

    const ip = getClientIp("fake, real-client", "172.18.0.5", trusted);
    expect(ip).toBe("real-client");
  });

  it("returns 'unknown' when no socket address and no trusted proxy", () => {
    const trusted = parseTrustedProxies(undefined);
    const ip = getClientIp(undefined, undefined, trusted);
    expect(ip).toBe("unknown");
  });

  it("rate limits by socket IP when XFF is spoofed without trusted proxy", async () => {
    delete process.env.TRUSTED_PROXY_IPS;

    const app = new Hono();
    app.use("/test", rateLimit({ max: 1, repo, scope: "test" }));
    app.get("/test", (c) => c.json({ ok: true }));

    const r1 = new Request("http://localhost/test", {
      headers: { "x-forwarded-for": "attacker-ip-1" },
    });
    const r2 = new Request("http://localhost/test", {
      headers: { "x-forwarded-for": "attacker-ip-2" },
    });

    const res1 = await app.request(r1);
    expect(res1.status).toBe(200);

    const res2 = await app.request(r2);
    expect(res2.status).toBe(429);
  });
});
