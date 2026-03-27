import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockGetOrganizationQuery,
  mockUpdateOrganizationMutate,
  mockInviteMemberMutate,
  mockRevokeInviteMutate,
  mockChangeRoleMutate,
  mockRemoveMemberMutate,
  mockTransferOwnershipMutate,
  mockDeleteOrganizationMutate,
  mockCreateOrganizationMutate,
} = vi.hoisted(() => ({
  mockGetOrganizationQuery: vi.fn(),
  mockUpdateOrganizationMutate: vi.fn(),
  mockInviteMemberMutate: vi.fn(),
  mockRevokeInviteMutate: vi.fn(),
  mockChangeRoleMutate: vi.fn(),
  mockRemoveMemberMutate: vi.fn(),
  mockTransferOwnershipMutate: vi.fn(),
  mockDeleteOrganizationMutate: vi.fn(),
  mockCreateOrganizationMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    org: {
      getOrganization: { query: mockGetOrganizationQuery },
      updateOrganization: { mutate: mockUpdateOrganizationMutate },
      inviteMember: { mutate: mockInviteMemberMutate },
      revokeInvite: { mutate: mockRevokeInviteMutate },
      changeRole: { mutate: mockChangeRoleMutate },
      removeMember: { mutate: mockRemoveMemberMutate },
      transferOwnership: { mutate: mockTransferOwnershipMutate },
      deleteOrganization: { mutate: mockDeleteOrganizationMutate },
      createOrganization: { mutate: mockCreateOrganizationMutate },
    },
  },
  trpc: {},
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(() => {
    throw new Error("Unauthorized");
  }),
  UnauthorizedError: class extends Error {},
}));

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://test-api:3001/api",
  PLATFORM_BASE_URL: "http://test-api:3001",
}));

vi.mock("@/lib/tenant-context", () => ({
  getActiveTenantId: vi.fn(() => "tenant-123"),
}));

import {
  changeRole,
  createOrganization,
  deleteOrganization,
  getOrganization,
  inviteMember,
  removeMember,
  revokeInvite,
  transferOwnership,
  updateOrganization,
} from "@/lib/org-api";

describe("getOrganization", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns organization from tRPC query", async () => {
    const org = {
      id: "org-1",
      name: "Test Org",
      slug: "test-org",
      billingEmail: "billing@test.com",
      members: [],
      invites: [],
    };
    mockGetOrganizationQuery.mockResolvedValue(org);

    const result = await getOrganization();
    expect(result).toEqual(org);
  });

  it("propagates tRPC errors", async () => {
    mockGetOrganizationQuery.mockRejectedValue(new Error("Not found"));
    await expect(getOrganization()).rejects.toThrow("Not found");
  });
});

describe("updateOrganization", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends orgId and data fields", async () => {
    const updated = {
      id: "org-1",
      name: "New Name",
      slug: "new-name",
      billingEmail: "new@test.com",
      members: [],
      invites: [],
    };
    mockUpdateOrganizationMutate.mockResolvedValue(updated);

    const result = await updateOrganization("org-1", { name: "New Name" });
    expect(result).toEqual(updated);
    expect(mockUpdateOrganizationMutate).toHaveBeenCalledWith({
      orgId: "org-1",
      name: "New Name",
    });
  });

  it("propagates tRPC errors", async () => {
    mockUpdateOrganizationMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(updateOrganization("org-1", { name: "X" })).rejects.toThrow("Forbidden");
  });
});

describe("inviteMember", () => {
  afterEach(() => vi.clearAllMocks());

  it("transforms epoch timestamps to ISO strings", async () => {
    const row = {
      id: "inv-1",
      orgId: "org-1",
      email: "user@test.com",
      role: "member" as const,
      invitedBy: "admin-1",
      token: "tok-abc",
      expiresAt: 1735689600000,
      createdAt: 1735603200000,
    };
    mockInviteMemberMutate.mockResolvedValue(row);

    const result = await inviteMember("org-1", "user@test.com", "member");
    expect(result.id).toBe("inv-1");
    expect(result.email).toBe("user@test.com");
    expect(result.role).toBe("member");
    expect(result.invitedBy).toBe("admin-1");
    expect(result.expiresAt).toBe(new Date(1735689600000).toISOString());
    expect(result.createdAt).toBe(new Date(1735603200000).toISOString());
    expect(mockInviteMemberMutate).toHaveBeenCalledWith({
      orgId: "org-1",
      email: "user@test.com",
      role: "member",
    });
  });

  it("propagates tRPC errors", async () => {
    mockInviteMemberMutate.mockRejectedValue(new Error("Duplicate invite"));
    await expect(inviteMember("org-1", "x@y.com", "admin")).rejects.toThrow("Duplicate invite");
  });
});

describe("revokeInvite", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls revokeInvite with orgId and inviteId", async () => {
    mockRevokeInviteMutate.mockResolvedValue({ revoked: true });

    await revokeInvite("org-1", "inv-1");
    expect(mockRevokeInviteMutate).toHaveBeenCalledWith({
      orgId: "org-1",
      inviteId: "inv-1",
    });
  });

  it("propagates tRPC errors", async () => {
    mockRevokeInviteMutate.mockRejectedValue(new Error("Not found"));
    await expect(revokeInvite("org-1", "inv-bad")).rejects.toThrow("Not found");
  });
});

describe("changeRole", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls changeRole with correct args", async () => {
    mockChangeRoleMutate.mockResolvedValue({ updated: true });

    await changeRole("org-1", "user-1", "admin");
    expect(mockChangeRoleMutate).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
      role: "admin",
    });
  });

  it("propagates tRPC errors", async () => {
    mockChangeRoleMutate.mockRejectedValue(new Error("Cannot change own role"));
    await expect(changeRole("org-1", "u", "member")).rejects.toThrow("Cannot change own role");
  });
});

describe("removeMember", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls removeMember with orgId and userId", async () => {
    mockRemoveMemberMutate.mockResolvedValue({ removed: true });

    await removeMember("org-1", "user-1");
    expect(mockRemoveMemberMutate).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
    });
  });

  it("propagates tRPC errors", async () => {
    mockRemoveMemberMutate.mockRejectedValue(new Error("Cannot remove owner"));
    await expect(removeMember("org-1", "owner")).rejects.toThrow("Cannot remove owner");
  });
});

describe("transferOwnership", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls transferOwnership with orgId and userId", async () => {
    mockTransferOwnershipMutate.mockResolvedValue({ transferred: true });

    await transferOwnership("org-1", "user-2");
    expect(mockTransferOwnershipMutate).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-2",
    });
  });

  it("propagates tRPC errors", async () => {
    mockTransferOwnershipMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(transferOwnership("org-1", "u")).rejects.toThrow("Forbidden");
  });
});

describe("deleteOrganization", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls deleteOrganization with orgId", async () => {
    mockDeleteOrganizationMutate.mockResolvedValue({ deleted: true });

    await deleteOrganization("org-1");
    expect(mockDeleteOrganizationMutate).toHaveBeenCalledWith({ orgId: "org-1" });
  });

  it("propagates tRPC errors", async () => {
    mockDeleteOrganizationMutate.mockRejectedValue(new Error("Has active bots"));
    await expect(deleteOrganization("org-1")).rejects.toThrow("Has active bots");
  });
});

describe("createOrganization", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes name and slug to tRPC", async () => {
    const created = { id: "org-new", name: "New Org", slug: "new-org" };
    mockCreateOrganizationMutate.mockResolvedValue(created);

    const result = await createOrganization({ name: "New Org", slug: "new-org" });
    expect(result).toEqual(created);
    expect(mockCreateOrganizationMutate).toHaveBeenCalledWith({
      name: "New Org",
      slug: "new-org",
    });
  });

  it("works without optional slug", async () => {
    mockCreateOrganizationMutate.mockResolvedValue({
      id: "org-2",
      name: "No Slug",
      slug: "no-slug",
    });

    await createOrganization({ name: "No Slug" });
    expect(mockCreateOrganizationMutate).toHaveBeenCalledWith({ name: "No Slug" });
  });

  it("propagates tRPC errors", async () => {
    mockCreateOrganizationMutate.mockRejectedValue(new Error("Slug taken"));
    await expect(createOrganization({ name: "X", slug: "taken" })).rejects.toThrow("Slug taken");
  });
});
