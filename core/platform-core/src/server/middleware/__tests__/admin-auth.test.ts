import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createAdminAuthMiddleware } from "../admin-auth.js";

function createApp(adminApiKey: string) {
  const app = new Hono();
  app.use("/admin/*", createAdminAuthMiddleware({ adminApiKey }));
  app.get("/admin/status", (c) => c.json({ ok: true }));
  return app;
}

describe("createAdminAuthMiddleware", () => {
  const API_KEY = "test-admin-key-abc123";

  it("returns 401 without Authorization header", async () => {
    const app = createApp(API_KEY);
    const res = await app.request("/admin/status");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Unauthorized");
  });

  it("returns 401 with wrong API key", async () => {
    const app = createApp(API_KEY);
    const res = await app.request("/admin/status", {
      headers: { authorization: "Bearer wrong-key" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("invalid admin credentials");
  });

  it("passes through with correct API key (timing-safe)", async () => {
    const app = createApp(API_KEY);
    const res = await app.request("/admin/status", {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("rejects keys of different length (timing-safe length check)", async () => {
    const app = createApp(API_KEY);
    // Key with same prefix but different length
    const res = await app.request("/admin/status", {
      headers: { authorization: `Bearer ${API_KEY}extra` },
    });
    expect(res.status).toBe(401);
  });

  it("returns 503 when admin key is not configured (fail-closed)", async () => {
    const app = createApp("");
    const res = await app.request("/admin/status", {
      headers: { authorization: "Bearer anything" },
    });
    expect(res.status).toBe(503);
  });

  it("rejects non-Bearer auth schemes", async () => {
    const app = createApp(API_KEY);
    const res = await app.request("/admin/status", {
      headers: { authorization: `Basic ${API_KEY}` },
    });
    expect(res.status).toBe(401);
  });
});
