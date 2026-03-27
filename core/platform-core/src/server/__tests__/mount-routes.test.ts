import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { PlatformContainer } from "../container.js";
import { mountRoutes } from "../mount-routes.js";
import { createTestContainer } from "../test-container.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultMountConfig() {
  return {
    provisionSecret: "test-secret",
    cryptoServiceKey: "test-crypto-key",
    platformDomain: "example.com",
  };
}

function makeApp(container: PlatformContainer) {
  const app = new Hono();
  mountRoutes(app, container, defaultMountConfig());
  return app;
}

async function req(app: Hono, method: string, path: string, opts?: RequestInit) {
  const request = new Request(`http://localhost${path}`, { method, ...opts });
  return app.request(request);
}

// ---------------------------------------------------------------------------
// Minimal stubs for feature sub-containers
// ---------------------------------------------------------------------------

function stubCrypto(): PlatformContainer["crypto"] {
  return {
    chargeRepo: {} as never,
    webhookSeenRepo: {} as never,
  };
}

function stubStripe(): PlatformContainer["stripe"] {
  return {
    stripe: {} as never,
    webhookSecret: "whsec_test",
    customerRepo: {} as never,
    processor: {
      handleWebhook: async () => ({ ok: true }),
    },
  };
}

function stubFleet(): PlatformContainer["fleet"] {
  return {
    manager: {} as never,
    docker: {} as never,
    proxy: {
      start: async () => {},
      addRoute: async () => {},
      removeRoute: () => {},
      getRoutes: () => [],
    } as never,
    profileStore: { list: async () => [] } as never,
    serviceKeyRepo: {} as never,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("mountRoutes", () => {
  // 1. Health endpoint always available
  it("mounts /health endpoint", async () => {
    const app = makeApp(createTestContainer());
    const res = await req(app, "GET", "/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  // 2. Crypto webhook mounted when crypto enabled
  it("mounts crypto webhook when crypto enabled", async () => {
    const container = createTestContainer({ crypto: stubCrypto() });
    const app = makeApp(container);
    const res = await req(app, "POST", "/api/webhooks/crypto", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // Should return 401 (no auth), NOT 404 (not found)
    expect(res.status).toBe(401);
  });

  // 3. Crypto webhook NOT mounted when crypto disabled
  it("does not mount crypto webhook when crypto disabled", async () => {
    const container = createTestContainer({ crypto: null });
    const app = makeApp(container);
    const res = await req(app, "POST", "/api/webhooks/crypto", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  // 4. Stripe webhook mounted when stripe enabled
  it("mounts stripe webhook when stripe enabled", async () => {
    const container = createTestContainer({ stripe: stubStripe() });
    const app = makeApp(container);
    const res = await req(app, "POST", "/api/webhooks/stripe", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // Should return 400 (missing stripe-signature), NOT 404
    expect(res.status).toBe(400);
  });

  // 5. Stripe webhook NOT mounted when stripe disabled
  it("does not mount stripe webhook when stripe disabled", async () => {
    const container = createTestContainer({ stripe: null });
    const app = makeApp(container);
    const res = await req(app, "POST", "/api/webhooks/stripe", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  // 6. Provision webhook mounted when fleet enabled
  it("mounts provision webhook when fleet enabled", async () => {
    const container = createTestContainer({ fleet: stubFleet() });
    const app = makeApp(container);
    const res = await req(app, "POST", "/api/provision/create", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    // Should return 401 (no auth), NOT 404
    expect(res.status).toBe(401);
  });

  // 7. Provision webhook NOT mounted when fleet disabled
  it("does not mount provision webhook when fleet disabled", async () => {
    const container = createTestContainer({ fleet: null });
    const app = makeApp(container);
    const res = await req(app, "POST", "/api/provision/create", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  // 8. Product-specific route plugins
  it("mounts product-specific route plugins", async () => {
    const container = createTestContainer();
    const app = new Hono();
    mountRoutes(app, container, defaultMountConfig(), [
      {
        path: "/api/custom",
        handler: () => {
          const sub = new Hono();
          sub.get("/ping", (c) => c.json({ pong: true }));
          return sub;
        },
      },
    ]);
    const res = await req(app, "GET", "/api/custom/ping");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ pong: true });
  });
});
