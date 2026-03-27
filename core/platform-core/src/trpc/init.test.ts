import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOrgMemberRepository } from "../tenancy/org-member-repository.js";
import {
  adminProcedure,
  createCallerFactory,
  orgAdminProcedure,
  orgMemberProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  setTrpcOrgMemberRepo,
  tenantProcedure,
} from "./init.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a stub org member repository. */
function makeMockRepo(overrides?: Partial<IOrgMemberRepository>): IOrgMemberRepository {
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
    ...overrides,
  };
}

/** Build a test router + caller factory exercising all procedure types. */
const appRouter = router({
  publicHello: publicProcedure.query(() => "public-ok"),
  protectedHello: protectedProcedure.query(() => "protected-ok"),
  adminHello: adminProcedure.query(() => "admin-ok"),
  tenantHello: tenantProcedure.query(() => "tenant-ok"),
  orgAction: orgMemberProcedure.input((v: unknown) => v as { orgId: string }).mutation(() => "org-ok"),
  orgAdminAction: orgAdminProcedure.input((v: unknown) => v as { orgId: string }).mutation(() => "org-admin-ok"),
});

const createCaller = createCallerFactory(appRouter);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tRPC procedure builders", () => {
  beforeEach(() => {
    setTrpcOrgMemberRepo(makeMockRepo());
  });

  // -----------------------------------------------------------------------
  // publicProcedure
  // -----------------------------------------------------------------------

  describe("publicProcedure", () => {
    it("allows unauthenticated access", async () => {
      const caller = createCaller({ user: undefined, tenantId: undefined });
      expect(await caller.publicHello()).toBe("public-ok");
    });

    it("allows authenticated access", async () => {
      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      expect(await caller.publicHello()).toBe("public-ok");
    });
  });

  // -----------------------------------------------------------------------
  // protectedProcedure
  // -----------------------------------------------------------------------

  describe("protectedProcedure", () => {
    it("rejects unauthenticated requests", async () => {
      const caller = createCaller({ user: undefined, tenantId: undefined });
      await expect(caller.protectedHello()).rejects.toThrow("Authentication required");
    });

    it("allows authenticated requests", async () => {
      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      expect(await caller.protectedHello()).toBe("protected-ok");
    });

    it("rejects session users with forged tenantId (not a member)", async () => {
      const repo = makeMockRepo({ findMember: vi.fn().mockResolvedValue(null) });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: "org-evil" });
      await expect(caller.protectedHello()).rejects.toThrow("Not authorized for this tenant");
    });

    it("allows session users with valid tenantId (personal tenant)", async () => {
      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: "u1" });
      expect(await caller.protectedHello()).toBe("protected-ok");
    });

    it("allows session users with valid tenantId (org member)", async () => {
      const repo = makeMockRepo({
        findMember: vi.fn().mockResolvedValue({ id: "m1", orgId: "org-1", userId: "u1", role: "member", joinedAt: 0 }),
      });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: "org-1" });
      expect(await caller.protectedHello()).toBe("protected-ok");
    });

    it("allows bearer-token users with any tenantId without org check", async () => {
      const caller = createCaller({ user: { id: "token:admin", roles: ["admin"] }, tenantId: "any-tenant" });
      expect(await caller.protectedHello()).toBe("protected-ok");
    });

    it("allows authenticated requests without tenantId", async () => {
      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      expect(await caller.protectedHello()).toBe("protected-ok");
    });

    it("allows platform_admin users with any tenantId without org check", async () => {
      const repo = makeMockRepo({ findMember: vi.fn().mockResolvedValue(null) });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "admin1", roles: ["platform_admin"] }, tenantId: "any-tenant" });
      expect(await caller.protectedHello()).toBe("protected-ok");
    });
  });

  // -----------------------------------------------------------------------
  // adminProcedure
  // -----------------------------------------------------------------------

  describe("adminProcedure", () => {
    it("rejects unauthenticated requests", async () => {
      const caller = createCaller({ user: undefined, tenantId: undefined });
      await expect(caller.adminHello()).rejects.toThrow("Authentication required");
    });

    it("rejects non-admin users", async () => {
      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      await expect(caller.adminHello()).rejects.toThrow("Platform admin role required");
    });

    it("allows platform_admin users", async () => {
      const caller = createCaller({
        user: { id: "admin1", roles: ["platform_admin"] },
        tenantId: undefined,
      });
      expect(await caller.adminHello()).toBe("admin-ok");
    });
  });

  // -----------------------------------------------------------------------
  // tenantProcedure
  // -----------------------------------------------------------------------

  describe("tenantProcedure", () => {
    it("rejects unauthenticated requests", async () => {
      const caller = createCaller({ user: undefined, tenantId: undefined });
      await expect(caller.tenantHello()).rejects.toThrow("Authentication required");
    });

    it("rejects when tenantId is missing", async () => {
      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      await expect(caller.tenantHello()).rejects.toThrow("Tenant context required");
    });

    it("allows bearer-token users (token: prefix) without org check", async () => {
      const caller = createCaller({
        user: { id: "token:admin", roles: ["admin"] },
        tenantId: "t1",
      });
      expect(await caller.tenantHello()).toBe("tenant-ok");
    });

    it("allows session users accessing their personal tenant", async () => {
      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: "u1" });
      expect(await caller.tenantHello()).toBe("tenant-ok");
    });

    it("allows session users who are org members", async () => {
      const repo = makeMockRepo({
        findMember: vi.fn().mockResolvedValue({ id: "m1", orgId: "org-t", userId: "u1", role: "member", joinedAt: 0 }),
      });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: "org-t" });
      expect(await caller.tenantHello()).toBe("tenant-ok");
    });

    it("rejects session users not in the org", async () => {
      const repo = makeMockRepo({ findMember: vi.fn().mockResolvedValue(null) });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: "org-other" });
      await expect(caller.tenantHello()).rejects.toThrow("Not authorized for this tenant");
    });

    it("allows platform_admin users to access any tenant without org check", async () => {
      const repo = makeMockRepo({ findMember: vi.fn().mockResolvedValue(null) });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "admin1", roles: ["platform_admin"] }, tenantId: "any-tenant" });
      expect(await caller.tenantHello()).toBe("tenant-ok");
    });
  });

  // -----------------------------------------------------------------------
  // orgMemberProcedure
  // -----------------------------------------------------------------------

  describe("orgMemberProcedure", () => {
    it("rejects unauthenticated requests", async () => {
      const caller = createCaller({ user: undefined, tenantId: undefined });
      await expect(caller.orgAction({ orgId: "org-1" })).rejects.toThrow("Authentication required");
    });

    it("rejects when orgId is missing from input", async () => {
      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      await expect(caller.orgAction({} as unknown as { orgId: string })).rejects.toThrow("orgId is required");
    });

    it("rejects non-members", async () => {
      const repo = makeMockRepo({ findMember: vi.fn().mockResolvedValue(null) });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      await expect(caller.orgAction({ orgId: "org-1" })).rejects.toThrow("Not a member of this organization");
    });

    it("allows org members", async () => {
      const repo = makeMockRepo({
        findMember: vi.fn().mockResolvedValue({ id: "m1", orgId: "org-1", userId: "u1", role: "member", joinedAt: 0 }),
      });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      expect(await caller.orgAction({ orgId: "org-1" })).toBe("org-ok");
    });
  });

  // -----------------------------------------------------------------------
  // orgAdminProcedure
  // -----------------------------------------------------------------------

  describe("orgAdminProcedure", () => {
    it("rejects regular members", async () => {
      const repo = makeMockRepo({
        findMember: vi.fn().mockResolvedValue({ id: "m1", orgId: "org-1", userId: "u1", role: "member", joinedAt: 0 }),
      });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      await expect(caller.orgAdminAction({ orgId: "org-1" })).rejects.toThrow("Admin or owner role required");
    });

    it("allows admin members", async () => {
      const repo = makeMockRepo({
        findMember: vi.fn().mockResolvedValue({ id: "m1", orgId: "org-1", userId: "u1", role: "admin", joinedAt: 0 }),
      });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      expect(await caller.orgAdminAction({ orgId: "org-1" })).toBe("org-admin-ok");
    });

    it("allows owner members", async () => {
      const repo = makeMockRepo({
        findMember: vi.fn().mockResolvedValue({ id: "m1", orgId: "org-1", userId: "u1", role: "owner", joinedAt: 0 }),
      });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      expect(await caller.orgAdminAction({ orgId: "org-1" })).toBe("org-admin-ok");
    });

    it("rejects non-members", async () => {
      const repo = makeMockRepo({ findMember: vi.fn().mockResolvedValue(null) });
      setTrpcOrgMemberRepo(repo);

      const caller = createCaller({ user: { id: "u1", roles: ["user"] }, tenantId: undefined });
      await expect(caller.orgAdminAction({ orgId: "org-1" })).rejects.toThrow("Not a member of this organization");
    });
  });
});
