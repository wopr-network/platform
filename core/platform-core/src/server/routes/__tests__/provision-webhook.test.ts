import { describe, expect, it, vi } from "vitest";
import type { FleetServices } from "../../container.js";
import { createTestContainer } from "../../test-container.js";
import { createProvisionWebhookRoutes, type ProvisionWebhookConfig } from "../provision-webhook.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = "test-provision-secret-1234";

function makeConfig(overrides?: Partial<ProvisionWebhookConfig>): ProvisionWebhookConfig {
  return {
    provisionSecret: SECRET,
    instanceImage: "ghcr.io/test/app:latest",
    containerPort: 3000,
    maxInstancesPerTenant: 5,
    gatewayUrl: "http://gateway:4000",
    containerPrefix: "test",
    ...overrides,
  };
}

function makeFleet(): FleetServices {
  return {
    manager: {
      create: vi.fn().mockResolvedValue({
        id: "inst-001",
        containerId: "docker-abc",
        containerName: "test-myapp",
        url: "http://test-myapp:3000",
        profile: { id: "inst-001", name: "myapp", tenantId: "tenant-1" },
      }),
      remove: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({
        id: "inst-001",
        name: "myapp",
        state: "running",
      }),
    } as never,
    docker: {} as never,
    proxy: {
      addRoute: vi.fn().mockResolvedValue(undefined),
      removeRoute: vi.fn(),
      updateHealth: vi.fn(),
      getRoutes: vi.fn().mockReturnValue([]),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    },
    profileStore: {
      init: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
    },
    serviceKeyRepo: {
      generate: vi.fn().mockResolvedValue("key-abc"),
      resolve: vi.fn().mockResolvedValue(null),
      revokeByInstance: vi.fn().mockResolvedValue(undefined),
      revokeByTenant: vi.fn().mockResolvedValue(undefined),
    } as never,
  };
}

function buildApp(opts?: { fleet?: FleetServices | null; config?: Partial<ProvisionWebhookConfig> }) {
  const container = createTestContainer({
    fleet: opts?.fleet !== undefined ? opts.fleet : makeFleet(),
  });
  const config = makeConfig(opts?.config);
  return createProvisionWebhookRoutes(container, config);
}

async function request(
  app: ReturnType<typeof buildApp>,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return app.request(path, init);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createProvisionWebhookRoutes", () => {
  // ---- Auth tests (apply to all endpoints) ----

  it("returns 401 without authorization header", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/create", { tenantId: "t1", subdomain: "test" });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 401 with wrong secret", async () => {
    const app = buildApp();
    const res = await request(
      app,
      "POST",
      "/create",
      { tenantId: "t1", subdomain: "test" },
      {
        Authorization: "Bearer wrong-secret",
      },
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  // ---- Fleet not configured ----

  it("returns 501 when fleet not configured (container.fleet is null)", async () => {
    const app = buildApp({ fleet: null });
    const res = await request(
      app,
      "POST",
      "/create",
      { tenantId: "t1", subdomain: "test" },
      {
        Authorization: `Bearer ${SECRET}`,
      },
    );

    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.error).toBe("Fleet management not configured");
  });

  it("returns 501 on destroy when fleet not configured", async () => {
    const app = buildApp({ fleet: null });
    const res = await request(
      app,
      "POST",
      "/destroy",
      { instanceId: "inst-001" },
      {
        Authorization: `Bearer ${SECRET}`,
      },
    );

    expect(res.status).toBe(501);
  });

  it("returns 501 on budget when fleet not configured", async () => {
    const app = buildApp({ fleet: null });
    const res = await request(
      app,
      "PUT",
      "/budget",
      { instanceId: "inst-001", tenantEntityId: "te-1", budgetCents: 1000 },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(501);
  });

  // ---- Create endpoint ----

  it("handles create webhook with valid auth and payload", async () => {
    const fleet = makeFleet();
    const app = buildApp({ fleet });
    const res = await request(
      app,
      "POST",
      "/create",
      { tenantId: "tenant-1", subdomain: "myapp" },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.instanceId).toBe("inst-001");
    expect(json.subdomain).toBe("myapp");
    expect(json.containerUrl).toBe("http://test-myapp:3000");

    // Verify fleet.create was called with generic env var names
    expect(fleet.manager.create).toHaveBeenCalledTimes(1);
    const createCall = (fleet.manager.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.env.HOSTED_MODE).toBe("true");
    expect(createCall.env.DEPLOYMENT_MODE).toBe("hosted_proxy");
    expect(createCall.env.DEPLOYMENT_EXPOSURE).toBe("private");
    expect(createCall.env.MIGRATION_AUTO_APPLY).toBe("true");
    // Verify NO product-specific prefixes
    expect(createCall.env.PAPERCLIP_HOSTED_MODE).toBeUndefined();
    expect(createCall.env.PAPERCLIP_DEPLOYMENT_MODE).toBeUndefined();

    // Verify proxy route was registered
    expect(fleet.proxy.addRoute).toHaveBeenCalledTimes(1);
  });

  it("returns 422 on create when required fields are missing", async () => {
    const app = buildApp();
    const res = await request(
      app,
      "POST",
      "/create",
      { tenantId: "tenant-1" }, // missing subdomain
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("Missing required fields");
  });

  // ---- Destroy endpoint ----

  it("handles destroy webhook with valid auth and instanceId", async () => {
    const fleet = makeFleet();
    const app = buildApp({ fleet });
    const res = await request(
      app,
      "POST",
      "/destroy",
      { instanceId: "inst-001" },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    expect(fleet.serviceKeyRepo.revokeByInstance).toHaveBeenCalledWith("inst-001");
    expect(fleet.manager.remove).toHaveBeenCalledWith("inst-001");
    expect(fleet.proxy.removeRoute).toHaveBeenCalledWith("inst-001");
  });

  it("returns 422 on destroy when instanceId is missing", async () => {
    const app = buildApp();
    const res = await request(
      app,
      "POST",
      "/destroy",
      {},
      {
        Authorization: `Bearer ${SECRET}`,
      },
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("Missing required field");
  });

  // ---- Budget endpoint ----

  it("handles budget webhook with valid auth and payload", async () => {
    const fleet = makeFleet();
    const app = buildApp({ fleet });
    const res = await request(
      app,
      "PUT",
      "/budget",
      { instanceId: "inst-001", tenantEntityId: "te-1", budgetCents: 5000 },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.budgetCents).toBe(5000);
  });

  it("returns 422 on budget when required fields are missing", async () => {
    const app = buildApp();
    const res = await request(
      app,
      "PUT",
      "/budget",
      { instanceId: "inst-001" }, // missing tenantEntityId, budgetCents
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("Missing required fields");
  });

  // ---- Generic env var names ----

  it("uses generic env var names with no PAPERCLIP_ prefix anywhere", async () => {
    const fleet = makeFleet();
    const app = buildApp({ fleet });
    await request(
      app,
      "POST",
      "/create",
      { tenantId: "tenant-1", subdomain: "myapp" },
      { Authorization: `Bearer ${SECRET}` },
    );

    const createCall = (fleet.manager.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const envKeys = Object.keys(createCall.env);
    for (const key of envKeys) {
      expect(key).not.toMatch(/^PAPERCLIP_/);
    }
    // Verify expected generic names are present
    expect(envKeys).toContain("HOSTED_MODE");
    expect(envKeys).toContain("DEPLOYMENT_MODE");
    expect(envKeys).toContain("DEPLOYMENT_EXPOSURE");
    expect(envKeys).toContain("MIGRATION_AUTO_APPLY");
    expect(envKeys).toContain("PROVISION_SECRET");
  });
});
