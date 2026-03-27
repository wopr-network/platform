import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolloutOrchestrator } from "../fleet/rollout-orchestrator.js";
import type { ITenantUpdateConfigRepository, TenantUpdateConfig } from "../fleet/tenant-update-config-repository.js";
import type { IOrgMemberRepository } from "../tenancy/org-member-repository.js";
import { createAdminFleetUpdateRouter } from "./admin-fleet-update-router.js";
import { createCallerFactory, router, setTrpcOrgMemberRepo } from "./init.js";

vi.mock("../config/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeOrchestrator(overrides: Partial<RolloutOrchestrator> = {}): RolloutOrchestrator {
  return {
    isRolling: false,
    rollout: vi.fn().mockResolvedValue({
      totalBots: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      aborted: false,
      alreadyRunning: false,
      results: [],
    }),
    ...overrides,
  } as unknown as RolloutOrchestrator;
}

function makeConfigRepo(configs: Record<string, TenantUpdateConfig> = {}): ITenantUpdateConfigRepository {
  return {
    get: vi.fn().mockImplementation((tenantId: string) => Promise.resolve(configs[tenantId] ?? null)),
    upsert: vi.fn().mockResolvedValue(undefined),
    listAutoEnabled: vi.fn().mockResolvedValue(Object.values(configs)),
  };
}

const adminCtx = {
  user: { id: "admin-1", roles: ["platform_admin"] },
  tenantId: undefined,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAdminFleetUpdateRouter", () => {
  let orchestrator: RolloutOrchestrator;
  let configRepo: ITenantUpdateConfigRepository;

  beforeEach(() => {
    setTrpcOrgMemberRepo(makeMockOrgRepo());
    orchestrator = makeOrchestrator();
    configRepo = makeConfigRepo();
  });

  function makeCaller() {
    const fleetRouter = createAdminFleetUpdateRouter(
      () => orchestrator,
      () => configRepo,
    );
    const appRouter = router({ fleet: fleetRouter });
    const createCaller = createCallerFactory(appRouter);
    return createCaller(adminCtx);
  }

  describe("rolloutStatus", () => {
    it("returns isRolling from orchestrator (false)", async () => {
      const caller = makeCaller();
      const status = await caller.fleet.rolloutStatus();
      expect(status).toEqual({ isRolling: false });
    });

    it("returns isRolling from orchestrator (true)", async () => {
      orchestrator = makeOrchestrator({ isRolling: true } as Partial<RolloutOrchestrator>);
      const caller = makeCaller();
      const status = await caller.fleet.rolloutStatus();
      expect(status).toEqual({ isRolling: true });
    });
  });

  describe("forceRollout", () => {
    it("calls orchestrator.rollout()", async () => {
      const caller = makeCaller();
      const result = await caller.fleet.forceRollout();

      expect(result).toEqual({ triggered: true });
      expect(orchestrator.rollout).toHaveBeenCalledOnce();
    });
  });

  describe("listTenantConfigs", () => {
    it("delegates to repo.listAutoEnabled()", async () => {
      const configs: TenantUpdateConfig[] = [
        { tenantId: "t1", mode: "auto", preferredHourUtc: 3, updatedAt: Date.now() },
        { tenantId: "t2", mode: "auto", preferredHourUtc: 12, updatedAt: Date.now() },
      ];
      vi.mocked(configRepo.listAutoEnabled).mockResolvedValue(configs);

      const caller = makeCaller();
      const result = await caller.fleet.listTenantConfigs();

      expect(configRepo.listAutoEnabled).toHaveBeenCalledOnce();
      expect(result).toEqual(configs);
    });
  });

  describe("setTenantConfig", () => {
    it("preserves existing preferredHourUtc when not provided", async () => {
      const existing: TenantUpdateConfig = {
        tenantId: "t1",
        mode: "auto",
        preferredHourUtc: 17,
        updatedAt: Date.now(),
      };
      vi.mocked(configRepo.get).mockResolvedValue(existing);

      const caller = makeCaller();
      await caller.fleet.setTenantConfig({ tenantId: "t1", mode: "manual" });

      expect(configRepo.get).toHaveBeenCalledWith("t1");
      expect(configRepo.upsert).toHaveBeenCalledWith("t1", {
        mode: "manual",
        preferredHourUtc: 17, // preserved from existing
      });
    });

    it("uses provided preferredHourUtc when given", async () => {
      const existing: TenantUpdateConfig = {
        tenantId: "t1",
        mode: "auto",
        preferredHourUtc: 17,
        updatedAt: Date.now(),
      };
      vi.mocked(configRepo.get).mockResolvedValue(existing);

      const caller = makeCaller();
      await caller.fleet.setTenantConfig({
        tenantId: "t1",
        mode: "auto",
        preferredHourUtc: 9,
      });

      expect(configRepo.upsert).toHaveBeenCalledWith("t1", {
        mode: "auto",
        preferredHourUtc: 9,
      });
    });

    it("defaults to 3 when no existing config and preferredHourUtc not provided", async () => {
      vi.mocked(configRepo.get).mockResolvedValue(null);

      const caller = makeCaller();
      await caller.fleet.setTenantConfig({ tenantId: "t-new", mode: "auto" });

      expect(configRepo.upsert).toHaveBeenCalledWith("t-new", {
        mode: "auto",
        preferredHourUtc: 3, // default
      });
    });
  });

  it("rejects non-admin users", async () => {
    const fleetRouter = createAdminFleetUpdateRouter(
      () => orchestrator,
      () => configRepo,
    );
    const appRouter = router({ fleet: fleetRouter });
    const createCaller = createCallerFactory(appRouter);
    const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });

    await expect(caller.fleet.rolloutStatus()).rejects.toThrow("Platform admin role required");
  });
});
