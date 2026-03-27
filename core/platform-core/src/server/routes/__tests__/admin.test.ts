import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOrgMemberRepository } from "../../../tenancy/org-member-repository.js";
import { createCallerFactory, router, setTrpcOrgMemberRepo } from "../../../trpc/init.js";
import type { PlatformContainer } from "../../container.js";
import { createTestContainer } from "../../test-container.js";
import type { AdminRouterConfig } from "../admin.js";
import { createAdminRouter } from "../admin.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock global fetch for OpenRouter API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeMockOrgRepo(): IOrgMemberRepository {
  return {
    listMembers: vi.fn().mockResolvedValue([]),
    addMember: vi.fn().mockResolvedValue(undefined),
    updateMemberRole: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    findMember: vi.fn().mockResolvedValue(null),
    countAdminsAndOwners: vi.fn().mockResolvedValue(0),
    listInvites: vi.fn().mockResolvedValue([]),
    createInvite: vi.fn().mockResolvedValue(undefined),
    findInviteById: vi.fn().mockResolvedValue(null),
    findInviteByToken: vi.fn().mockResolvedValue(null),
    deleteInvite: vi.fn().mockResolvedValue(undefined),
    deleteAllMembers: vi.fn().mockResolvedValue(undefined),
    deleteAllInvites: vi.fn().mockResolvedValue(undefined),
    listOrgsByUser: vi.fn().mockResolvedValue([]),
    markInviteAccepted: vi.fn().mockResolvedValue(undefined),
  } as unknown as IOrgMemberRepository;
}

const adminCtx = {
  user: { id: "admin-1", roles: ["platform_admin"] },
  tenantId: undefined,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCaller(container: PlatformContainer, config?: AdminRouterConfig) {
  const adminRouter = createAdminRouter(container, config);
  const appRouter = router({ admin: adminRouter });
  const createCaller = createCallerFactory(appRouter);
  return createCaller(adminCtx);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAdminRouter", () => {
  beforeEach(() => {
    setTrpcOrgMemberRepo(makeMockOrgRepo());
    mockFetch.mockReset();
  });

  // -------------------------------------------------------------------------
  // Model list endpoint
  // -------------------------------------------------------------------------

  describe("listAvailableModels", () => {
    it("returns cached models from OpenRouter API", async () => {
      const container = createTestContainer();
      const models = [
        {
          id: "openai/gpt-4",
          name: "GPT-4",
          context_length: 8192,
          pricing: { prompt: "0.03", completion: "0.06" },
        },
        {
          id: "anthropic/claude-3",
          name: "Claude 3",
          context_length: 200000,
          pricing: { prompt: "0.015", completion: "0.075" },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: models }),
      });

      const caller = makeCaller(container, { openRouterApiKey: "sk-test-key" });
      const result = await caller.admin.listAvailableModels();

      expect(result.models).toHaveLength(2);
      expect(result.models[0].id).toBe("anthropic/claude-3");
      expect(result.models[1].id).toBe("openai/gpt-4");
      expect(mockFetch).toHaveBeenCalledOnce();

      // Second call should use cache (no additional fetch)
      const result2 = await caller.admin.listAvailableModels();
      expect(result2.models).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("returns empty list when no API key configured", async () => {
      const container = createTestContainer();
      const caller = makeCaller(container); // no config = no API key

      const result = await caller.admin.listAvailableModels();

      expect(result.models).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns stale cache on fetch failure", async () => {
      // First call seeds the cache
      const container = createTestContainer();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: "model/a", name: "A", context_length: 100, pricing: { prompt: "1", completion: "2" } }],
        }),
      });
      const caller = makeCaller(container, { openRouterApiKey: "sk-test-key" });
      await caller.admin.listAvailableModels();

      // Advance past 60s cache TTL so the next call triggers a fetch
      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);

      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await caller.admin.listAvailableModels();

      // On failure, falls back to stale cache
      expect(result.models).toHaveLength(1);
      expect(result.models[0].id).toBe("model/a");

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Fleet instance listing
  // -------------------------------------------------------------------------

  describe("listAllInstances", () => {
    it("lists instances using container.fleet", async () => {
      const mockProfiles = [
        { id: "inst-1", name: "Bot A", tenantId: "t1", image: "img:latest" },
        { id: "inst-2", name: "Bot B", tenantId: "t2", image: "img:v2" },
      ];

      const mockStatus = {
        state: "running",
        health: "healthy",
        uptime: 3600,
        containerId: "abc123",
        startedAt: "2026-01-01T00:00:00Z",
      };

      const container = createTestContainer({
        fleet: {
          manager: {
            status: vi.fn().mockResolvedValue(mockStatus),
          } as never,
          docker: {} as never,
          proxy: {} as never,
          profileStore: {
            list: vi.fn().mockResolvedValue(mockProfiles),
            init: vi.fn(),
            save: vi.fn(),
            get: vi.fn(),
            delete: vi.fn(),
          },
          serviceKeyRepo: {} as never,
        },
      });

      const caller = makeCaller(container);
      const result = await caller.admin.listAllInstances();

      expect(result.instances).toHaveLength(2);
      expect(result.instances[0]).toEqual({
        id: "inst-1",
        name: "Bot A",
        tenantId: "t1",
        image: "img:latest",
        state: "running",
        health: "healthy",
        uptime: 3600,
        containerId: "abc123",
        startedAt: "2026-01-01T00:00:00Z",
      });
    });

    it("returns error when fleet not configured", async () => {
      const container = createTestContainer({ fleet: null });
      const caller = makeCaller(container);
      const result = await caller.admin.listAllInstances();

      expect(result.instances).toEqual([]);
      expect(result.error).toBe("Fleet not configured");
    });

    it("returns error state for instances that fail status check", async () => {
      const mockProfiles = [{ id: "inst-bad", name: "Bad Bot", tenantId: "t1", image: "img:latest" }];

      const container = createTestContainer({
        fleet: {
          manager: {
            status: vi.fn().mockRejectedValue(new Error("container not found")),
          } as never,
          docker: {} as never,
          proxy: {} as never,
          profileStore: {
            list: vi.fn().mockResolvedValue(mockProfiles),
            init: vi.fn(),
            save: vi.fn(),
            get: vi.fn(),
            delete: vi.fn(),
          },
          serviceKeyRepo: {} as never,
        },
      });

      const caller = makeCaller(container);
      const result = await caller.admin.listAllInstances();

      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].state).toBe("error");
      expect(result.instances[0].health).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Credit balance query
  // -------------------------------------------------------------------------

  describe("billingOverview", () => {
    it("queries credit balance via container pool", async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ totalRaw: "50000000" }] }) // credit_entry sum (50M microdollars = 5000 cents)
          .mockResolvedValueOnce({ rows: [{ count: "3" }] }) // payment methods
          .mockResolvedValueOnce({ rows: [{ count: "5" }] }), // orgs
        end: vi.fn(),
      };

      const container = createTestContainer({
        pool: mockPool as never,
        gateway: null, // no gateway = skip service key count
      });

      const caller = makeCaller(container);
      const result = await caller.admin.billingOverview();

      expect(result.totalBalanceCents).toBe(5000);
      expect(result.activeKeyCount).toBe(0); // gateway not configured
      expect(result.paymentMethodCount).toBe(3);
      expect(result.orgCount).toBe(5);
    });

    it("counts active service keys when gateway is configured", async () => {
      const mockPool = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ totalRaw: "0" }] }) // credit_entry
          .mockResolvedValueOnce({ rows: [{ count: "7" }] }) // service_keys
          .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // payment methods
          .mockResolvedValueOnce({ rows: [{ count: "0" }] }), // orgs
        end: vi.fn(),
      };

      const container = createTestContainer({
        pool: mockPool as never,
        gateway: {
          serviceKeyRepo: {} as never,
        },
      });

      const caller = makeCaller(container);
      const result = await caller.admin.billingOverview();

      expect(result.activeKeyCount).toBe(7);
    });

    it("returns zeros when tables do not exist", async () => {
      const mockPool = {
        query: vi.fn().mockRejectedValue(new Error('relation "credit_entry" does not exist')),
        end: vi.fn(),
      };

      const container = createTestContainer({
        pool: mockPool as never,
      });

      const caller = makeCaller(container);
      const result = await caller.admin.billingOverview();

      expect(result.totalBalanceCents).toBe(0);
      expect(result.activeKeyCount).toBe(0);
      expect(result.paymentMethodCount).toBe(0);
      expect(result.orgCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------

  it("rejects non-admin users", async () => {
    const container = createTestContainer();
    const adminRouter = createAdminRouter(container);
    const appRouter = router({ admin: adminRouter });
    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });

    await expect(caller.admin.listAvailableModels()).rejects.toThrow("Platform admin role required");
  });
});
