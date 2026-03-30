import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { type InternalServiceAuthEnv, internalServiceAuth, parseAllowedTokens } from "./internal-service-auth.js";

// ---------------------------------------------------------------------------
// Test Tokens
// ---------------------------------------------------------------------------

const TOKEN_WOPR_UI = "core_wopr-ui_a1b2c3d4e5f6";
const TOKEN_PAPERCLIP_UI = "core_paperclip-ui_x9y8z7w6";
const TOKEN_HOLYSHIP = "core_holyship_m3n4o5p6";
const ALLOWED_TOKENS = [TOKEN_WOPR_UI, TOKEN_PAPERCLIP_UI, TOKEN_HOLYSHIP].join(",");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createApp() {
  const app = new Hono<InternalServiceAuthEnv>();
  app.use("*", internalServiceAuth({ allowedTokens: ALLOWED_TOKENS }));
  app.get("/test", (c) =>
    c.json({
      serviceName: c.get("serviceName"),
      tenantId: c.get("tenantId"),
      userId: c.get("userId"),
      product: c.get("product"),
      authMethod: c.get("authMethod"),
      userRoles: c.get("userRoles"),
      requestId: c.get("requestId"),
    }),
  );
  return app;
}

function makeRequest(app: Hono<InternalServiceAuthEnv>, headers: Record<string, string> = {}) {
  const reqHeaders = new Headers(headers);
  return app.request("/test", { method: "GET", headers: reqHeaders });
}

// ---------------------------------------------------------------------------
// parseAllowedTokens
// ---------------------------------------------------------------------------

describe("parseAllowedTokens", () => {
  it("parses comma-separated tokens", () => {
    const map = parseAllowedTokens(ALLOWED_TOKENS);
    expect(map.size).toBe(3);
    expect(map.get(TOKEN_WOPR_UI)).toBe("wopr-ui");
    expect(map.get(TOKEN_PAPERCLIP_UI)).toBe("paperclip-ui");
    expect(map.get(TOKEN_HOLYSHIP)).toBe("holyship");
  });

  it("returns empty map for empty string", () => {
    expect(parseAllowedTokens("").size).toBe(0);
    expect(parseAllowedTokens("  ").size).toBe(0);
  });

  it("skips malformed tokens", () => {
    const map = parseAllowedTokens("bad_token,core_good_abc,nope");
    expect(map.size).toBe(1);
    expect(map.get("core_good_abc")).toBe("good");
  });

  it("trims whitespace around tokens", () => {
    const map = parseAllowedTokens("  core_svc_abc , core_svc2_def  ");
    expect(map.size).toBe(2);
    expect(map.get("core_svc_abc")).toBe("svc");
    expect(map.get("core_svc2_def")).toBe("svc2");
  });
});

// ---------------------------------------------------------------------------
// Middleware — Authentication
// ---------------------------------------------------------------------------

describe("internalServiceAuth", () => {
  it("passes with valid token and all required headers", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serviceName).toBe("wopr-ui");
    expect(body.tenantId).toBe("tenant-123");
    expect(body.userId).toBe("user-456");
    expect(body.product).toBe("wopr");
    expect(body.authMethod).toBe("session");
    expect(body.userRoles).toEqual(["user"]);
    expect(body.requestId).toBeTruthy();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Missing service token");
  });

  it("returns 401 for invalid token", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: "Bearer core_fake_badtoken",
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid service token");
  });

  it("returns 401 for non-Bearer auth scheme", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Basic ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
    });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Required Headers
  // ---------------------------------------------------------------------------

  it("returns 400 when X-Tenant-Id is missing", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-User-Id": "user-456",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/X-Tenant-Id/);
  });

  it("returns 400 when X-User-Id is missing", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/X-User-Id/);
  });

  it("returns 400 when X-Tenant-Id exceeds 255 chars", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "a".repeat(256),
      "X-User-Id": "user-456",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when X-User-Id exceeds 255 chars", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "a".repeat(256),
    });
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Optional Headers — X-Product
  // ---------------------------------------------------------------------------

  it("accepts known product slugs", async () => {
    const app = createApp();
    for (const slug of ["wopr", "paperclip", "nemoclaw", "holyship"]) {
      const res = await makeRequest(app, {
        Authorization: `Bearer ${TOKEN_WOPR_UI}`,
        "X-Tenant-Id": "tenant-123",
        "X-User-Id": "user-456",
        "X-Product": slug,
      });
      const body = await res.json();
      expect(body.product).toBe(slug);
    }
  });

  it("defaults to wopr for unknown product slug", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
      "X-Product": "unknown-product",
    });
    const body = await res.json();
    expect(body.product).toBe("wopr");
  });

  it("normalizes product slug to lowercase", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
      "X-Product": "Paperclip",
    });
    const body = await res.json();
    expect(body.product).toBe("paperclip");
  });

  // ---------------------------------------------------------------------------
  // Optional Headers — X-User-Roles
  // ---------------------------------------------------------------------------

  it("parses comma-separated roles", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
      "X-User-Roles": "admin,user",
    });
    const body = await res.json();
    expect(body.userRoles).toEqual(["admin", "user"]);
  });

  it("trims whitespace in roles", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
      "X-User-Roles": " admin , user , moderator ",
    });
    const body = await res.json();
    expect(body.userRoles).toEqual(["admin", "user", "moderator"]);
  });

  it("defaults roles to [user] when header is missing", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
    });
    const body = await res.json();
    expect(body.userRoles).toEqual(["user"]);
  });

  // ---------------------------------------------------------------------------
  // Optional Headers — X-Request-Id
  // ---------------------------------------------------------------------------

  it("uses provided X-Request-Id", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
      "X-Request-Id": "custom-request-id-789",
    });
    const body = await res.json();
    expect(body.requestId).toBe("custom-request-id-789");
  });

  it("auto-generates X-Request-Id when missing", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
    });
    const body = await res.json();
    // Should be a UUID (36 chars with dashes)
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  // ---------------------------------------------------------------------------
  // Optional Headers — X-Auth-Method
  // ---------------------------------------------------------------------------

  it("passes through X-Auth-Method", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
      "X-Auth-Method": "api_key",
    });
    const body = await res.json();
    expect(body.authMethod).toBe("api_key");
  });

  it("defaults authMethod to session when header is missing", async () => {
    const app = createApp();
    const res = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "tenant-123",
      "X-User-Id": "user-456",
    });
    const body = await res.json();
    expect(body.authMethod).toBe("session");
  });

  // ---------------------------------------------------------------------------
  // Multiple tokens
  // ---------------------------------------------------------------------------

  it("accepts any of the allowed tokens", async () => {
    const app = createApp();

    const res1 = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_PAPERCLIP_UI}`,
      "X-Tenant-Id": "t1",
      "X-User-Id": "u1",
    });
    expect(res1.status).toBe(200);
    expect((await res1.json()).serviceName).toBe("paperclip-ui");

    const res2 = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_HOLYSHIP}`,
      "X-Tenant-Id": "t2",
      "X-User-Id": "u2",
    });
    expect(res2.status).toBe(200);
    expect((await res2.json()).serviceName).toBe("holyship");
  });

  // ---------------------------------------------------------------------------
  // Timing safety — functional check
  // ---------------------------------------------------------------------------

  it("iterates all tokens even on first match (timing-safe)", async () => {
    // This is a functional test, not a timing test. We verify that the
    // middleware correctly authenticates tokens at any position in the list.
    const app = createApp();

    // First token in list
    const res1 = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_WOPR_UI}`,
      "X-Tenant-Id": "t",
      "X-User-Id": "u",
    });
    expect(res1.status).toBe(200);

    // Last token in list
    const res2 = await makeRequest(app, {
      Authorization: `Bearer ${TOKEN_HOLYSHIP}`,
      "X-Tenant-Id": "t",
      "X-User-Id": "u",
    });
    expect(res2.status).toBe(200);

    // Invalid token (same length as a valid one to exercise timing-safe path)
    const fakeToken = `core_wopr-ui_${"z".repeat(TOKEN_WOPR_UI.length - 13)}`;
    const res3 = await makeRequest(app, {
      Authorization: `Bearer ${fakeToken}`,
      "X-Tenant-Id": "t",
      "X-User-Id": "u",
    });
    expect(res3.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // AuthUser compatibility
  // ---------------------------------------------------------------------------

  it("sets AuthUser on context for downstream compatibility", async () => {
    const app = new Hono<InternalServiceAuthEnv>();
    app.use("*", internalServiceAuth({ allowedTokens: ALLOWED_TOKENS }));
    app.get("/test", (c) => {
      const user = c.get("user");
      return c.json({ userId: user.id, roles: user.roles });
    });

    const res = await app.request("/test", {
      method: "GET",
      headers: new Headers({
        Authorization: `Bearer ${TOKEN_WOPR_UI}`,
        "X-Tenant-Id": "tenant-123",
        "X-User-Id": "user-456",
        "X-User-Roles": "admin,user",
      }),
    });
    const body = await res.json();
    expect(body.userId).toBe("user-456");
    expect(body.roles).toEqual(["admin", "user"]);
  });
});
