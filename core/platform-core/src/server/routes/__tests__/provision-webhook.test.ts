import { describe, expect, it, vi } from "vitest";
import type { FleetServices } from "../../container.js";
import { createTestContainer } from "../../test-container.js";
import { createProvisionWebhookRoutes, type ProvisionWebhookConfig } from "../provision-webhook.js";

// Mock provision-client to avoid real HTTP calls to containers
vi.mock("@wopr-network/provision-client", () => ({
  provisionContainer: vi.fn().mockResolvedValue({
    tenantEntityId: "te-1",
    tenantSlug: "myapp",
    adminUserId: "admin-1",
    agents: [],
  }),
  deprovisionContainer: vi.fn().mockResolvedValue(undefined),
  updateBudget: vi.fn().mockResolvedValue(undefined),
  checkHealth: vi.fn().mockResolvedValue(true),
}));

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

const mockInstance = {
  id: "inst-001",
  containerId: "docker-abc",
  containerName: "test-myapp",
  url: "http://test-myapp:3000",
  profile: { id: "inst-001", name: "myapp", tenantId: "tenant-1" },
  stop: vi.fn().mockResolvedValue(undefined),
  start: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
};

const mockFleetManager = {
  create: vi.fn().mockResolvedValue(mockInstance),
  remove: vi.fn().mockResolvedValue(undefined),
  status: vi.fn().mockResolvedValue({ id: "inst-001", name: "myapp", state: "running" }),
  getInstance: vi.fn().mockResolvedValue(mockInstance),
  listByTenant: vi.fn().mockResolvedValue([]),
};

function makeFleet(): FleetServices {
  return {
    manager: mockFleetManager as never,
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
    nodeRegistry: {
      getFleetManager: vi.fn().mockReturnValue(mockFleetManager),
      resolveUpstreamHost: vi.fn().mockReturnValue("test-myapp"),
      getContainerCounts: vi.fn().mockResolvedValue(new Map()),
      setBotInstanceRepo: vi.fn(),
      list: vi.fn().mockReturnValue([{ config: { id: "local", maxContainers: 10 }, fleet: mockFleetManager }]),
    } as never,
    placementStrategy: {
      selectNode: vi.fn().mockReturnValue({ config: { id: "local", maxContainers: 10 }, fleet: mockFleetManager }),
    } as never,
    fleetResolver: {
      addRoute: vi.fn(),
      removeRoute: vi.fn(),
      registerRoute: vi.fn(),
      unregisterRoute: vi.fn(),
    } as never,
    orgInstanceResolver: {} as never,
  };
}

const mockInstanceService = {
  create: vi.fn().mockResolvedValue({
    id: "inst-001",
    name: "myapp",
    tenantId: "tenant-1",
    nodeId: "local",
    containerUrl: "http://test-myapp:3000",
    gatewayKey: "key-abc",
    provisioned: true,
  }),
  createContainer: vi.fn(),
  destroy: vi.fn().mockResolvedValue(undefined),
  updateBudget: vi.fn().mockResolvedValue(undefined),
};

function buildApp(opts?: { fleet?: FleetServices | null; config?: Partial<ProvisionWebhookConfig> }) {
  const fleet = opts?.fleet !== undefined ? opts.fleet : makeFleet();
  const container = createTestContainer({
    fleet,
    instanceService: fleet ? (mockInstanceService as never) : null,
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

  it("returns 501 when instanceService not configured", async () => {
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
    expect(json.error).toBe("Instance service not configured");
  });

  it("returns 501 on destroy when instanceService not configured", async () => {
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

  it("returns 501 on budget when instanceService not configured", async () => {
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
    mockInstanceService.create.mockClear();
    const app = buildApp();
    const res = await request(
      app,
      "POST",
      "/create",
      { tenantId: "tenant-1", subdomain: "myapp", product: "test" },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.instanceId).toBe("inst-001");
    expect(json.subdomain).toBe("myapp");
    expect(json.containerUrl).toBe("http://test-myapp:3000");
    expect(json.nodeId).toBe("local");

    // Verify instanceService.create was called (single path)
    expect(mockInstanceService.create).toHaveBeenCalledTimes(1);
    expect(mockInstanceService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        name: "myapp",
        productSlug: "test",
      }),
    );
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
    mockInstanceService.destroy.mockClear();
    const app = buildApp();
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

    expect(mockInstanceService.destroy).toHaveBeenCalledWith(expect.objectContaining({ instanceId: "inst-001" }));
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

  it("delegates to instanceService.create with product config", async () => {
    mockInstanceService.create.mockClear();
    const app = buildApp();
    await request(
      app,
      "POST",
      "/create",
      {
        tenantId: "tenant-1",
        subdomain: "myapp",
        product: "test",
        adminUser: { id: "user-1", email: "admin@test.com" },
        agents: [{ name: "CEO", role: "ceo" }],
      },
      { Authorization: `Bearer ${SECRET}` },
    );

    expect(mockInstanceService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: "user-1",
        userEmail: "admin@test.com",
        name: "myapp",
        productSlug: "test",
        extra: expect.objectContaining({
          ceoName: "CEO",
        }),
      }),
    );
  });
});
