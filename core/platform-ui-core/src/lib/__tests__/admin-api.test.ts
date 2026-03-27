import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockTenantDetailQuery,
  mockTenantAgentsQuery,
  mockNotesListQuery,
  mockNotesCreateMutate,
  mockSuspendTenantMutate,
  mockReactivateTenantMutate,
  mockCreditsGrantMutate,
  mockCreditsRefundMutate,
  mockTenantChangeRoleMutate,
  mockBanTenantMutate,
  mockCreditsTransactionsExportQuery,
  mockCreditsTransactionsQuery,
  mockTenantUsageByCapabilityQuery,
  mockUsersListQuery,
  mockBulkGrantMutate,
  mockBulkSuspendMutate,
  mockBulkReactivateMutate,
} = vi.hoisted(() => ({
  mockTenantDetailQuery: vi.fn(),
  mockTenantAgentsQuery: vi.fn(),
  mockNotesListQuery: vi.fn(),
  mockNotesCreateMutate: vi.fn(),
  mockSuspendTenantMutate: vi.fn(),
  mockReactivateTenantMutate: vi.fn(),
  mockCreditsGrantMutate: vi.fn(),
  mockCreditsRefundMutate: vi.fn(),
  mockTenantChangeRoleMutate: vi.fn(),
  mockBanTenantMutate: vi.fn(),
  mockCreditsTransactionsExportQuery: vi.fn(),
  mockCreditsTransactionsQuery: vi.fn(),
  mockTenantUsageByCapabilityQuery: vi.fn(),
  mockUsersListQuery: vi.fn(),
  mockBulkGrantMutate: vi.fn(),
  mockBulkSuspendMutate: vi.fn(),
  mockBulkReactivateMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    admin: {
      tenantDetail: { query: mockTenantDetailQuery },
      tenantAgents: { query: mockTenantAgentsQuery },
      notesList: { query: mockNotesListQuery },
      notesCreate: { mutate: mockNotesCreateMutate },
      suspendTenant: { mutate: mockSuspendTenantMutate },
      reactivateTenant: { mutate: mockReactivateTenantMutate },
      creditsGrant: { mutate: mockCreditsGrantMutate },
      creditsRefund: { mutate: mockCreditsRefundMutate },
      tenantChangeRole: { mutate: mockTenantChangeRoleMutate },
      banTenant: { mutate: mockBanTenantMutate },
      creditsTransactionsExport: { query: mockCreditsTransactionsExportQuery },
      creditsTransactions: { query: mockCreditsTransactionsQuery },
      tenantUsageByCapability: { query: mockTenantUsageByCapabilityQuery },
      usersList: { query: mockUsersListQuery },
      bulkGrant: { mutate: mockBulkGrantMutate },
      bulkSuspend: { mutate: mockBulkSuspendMutate },
      bulkReactivate: { mutate: mockBulkReactivateMutate },
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
  addTenantNote,
  banTenant,
  bulkGrantCredits,
  bulkReactivateTenants,
  bulkSuspendTenants,
  changeRole,
  getTenantAgents,
  getTenantDetail,
  getTenantNotes,
  getTenantUsageByCapability,
  getTransactions,
  getTransactionsCsv,
  getUsersList,
  grantCredits,
  reactivateTenant,
  refundCredits,
  suspendTenant,
} from "@/lib/admin-api";

describe("getTenantDetail", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns tenant detail from tRPC query", async () => {
    const detail = {
      user: {
        id: "u-1",
        email: "a@b.com",
        name: "A",
        tenant_id: "t-1",
        status: "active",
        role: "owner",
        credit_balance_cents: 500,
        agent_count: 2,
        last_seen: null,
        created_at: 1000,
      },
      credits: { balance_cents: 500, recent_transactions: { entries: [], total: 0 } },
      status: { tenantId: "t-1", status: "active" },
      usage: { summaries: [], total: { totalCost: 0, totalCharge: 0, eventCount: 0 } },
    };
    mockTenantDetailQuery.mockResolvedValue(detail);

    const result = await getTenantDetail("t-1");
    expect(result).toEqual(detail);
    expect(mockTenantDetailQuery).toHaveBeenCalledWith({ tenantId: "t-1" });
  });

  it("propagates tRPC errors", async () => {
    mockTenantDetailQuery.mockRejectedValue(new Error("Not found"));
    await expect(getTenantDetail("bad")).rejects.toThrow("Not found");
  });
});

describe("getTenantAgents", () => {
  afterEach(() => vi.clearAllMocks());

  it("unwraps agents array from response", async () => {
    const agents = [
      {
        id: "b-1",
        tenantId: "t-1",
        name: "Bot1",
        nodeId: null,
        billingState: "active",
        suspendedAt: null,
        destroyAfter: null,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ];
    mockTenantAgentsQuery.mockResolvedValue({ agents });

    const result = await getTenantAgents("t-1");
    expect(result).toEqual(agents);
    expect(mockTenantAgentsQuery).toHaveBeenCalledWith({ tenantId: "t-1" });
  });

  it("propagates tRPC errors", async () => {
    mockTenantAgentsQuery.mockRejectedValue(new Error("Forbidden"));
    await expect(getTenantAgents("t-1")).rejects.toThrow("Forbidden");
  });
});

describe("getTenantNotes", () => {
  afterEach(() => vi.clearAllMocks());

  it("unwraps notes array from response", async () => {
    const notes = [
      { id: "n-1", tenant_id: "t-1", admin_user: "admin", content: "Note", created_at: 1000 },
    ];
    mockNotesListQuery.mockResolvedValue({ notes });

    const result = await getTenantNotes("t-1");
    expect(result).toEqual(notes);
    expect(mockNotesListQuery).toHaveBeenCalledWith({ tenantId: "t-1" });
  });

  it("propagates tRPC errors", async () => {
    mockNotesListQuery.mockRejectedValue(new Error("Server error"));
    await expect(getTenantNotes("t-1")).rejects.toThrow("Server error");
  });
});

describe("addTenantNote", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates note and returns it", async () => {
    const note = {
      id: "n-2",
      tenant_id: "t-1",
      admin_user: "admin",
      content: "Hello",
      created_at: 2000,
    };
    mockNotesCreateMutate.mockResolvedValue(note);

    const result = await addTenantNote("t-1", "Hello");
    expect(result).toEqual(note);
    expect(mockNotesCreateMutate).toHaveBeenCalledWith({ tenantId: "t-1", content: "Hello" });
  });

  it("propagates tRPC errors", async () => {
    mockNotesCreateMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(addTenantNote("t-1", "x")).rejects.toThrow("Forbidden");
  });
});

describe("suspendTenant", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls suspendTenant with tenantId and reason", async () => {
    mockSuspendTenantMutate.mockResolvedValue(undefined);

    await suspendTenant("t-1", "Payment failed");
    expect(mockSuspendTenantMutate).toHaveBeenCalledWith({
      tenantId: "t-1",
      reason: "Payment failed",
    });
  });

  it("propagates tRPC errors", async () => {
    mockSuspendTenantMutate.mockRejectedValue(new Error("Already suspended"));
    await expect(suspendTenant("t-1", "r")).rejects.toThrow("Already suspended");
  });
});

describe("reactivateTenant", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls reactivateTenant with tenantId", async () => {
    mockReactivateTenantMutate.mockResolvedValue(undefined);

    await reactivateTenant("t-1");
    expect(mockReactivateTenantMutate).toHaveBeenCalledWith({ tenantId: "t-1" });
  });

  it("propagates tRPC errors", async () => {
    mockReactivateTenantMutate.mockRejectedValue(new Error("Not suspended"));
    await expect(reactivateTenant("t-1")).rejects.toThrow("Not suspended");
  });
});

describe("grantCredits", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls creditsGrant with correct args", async () => {
    mockCreditsGrantMutate.mockResolvedValue(undefined);

    await grantCredits("t-1", 1000, "Welcome bonus");
    expect(mockCreditsGrantMutate).toHaveBeenCalledWith({
      tenantId: "t-1",
      amount_cents: 1000,
      reason: "Welcome bonus",
    });
  });

  it("propagates tRPC errors", async () => {
    mockCreditsGrantMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(grantCredits("t-1", 100, "r")).rejects.toThrow("Forbidden");
  });
});

describe("refundCredits", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls creditsRefund with correct args", async () => {
    mockCreditsRefundMutate.mockResolvedValue(undefined);

    await refundCredits("t-1", 500, "Service outage");
    expect(mockCreditsRefundMutate).toHaveBeenCalledWith({
      tenantId: "t-1",
      amount_cents: 500,
      reason: "Service outage",
    });
  });

  it("propagates tRPC errors", async () => {
    mockCreditsRefundMutate.mockRejectedValue(new Error("Insufficient"));
    await expect(refundCredits("t-1", 999, "r")).rejects.toThrow("Insufficient");
  });
});

describe("changeRole", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls tenantChangeRole with correct args", async () => {
    mockTenantChangeRoleMutate.mockResolvedValue(undefined);

    await changeRole("user-1", "t-1", "admin");
    expect(mockTenantChangeRoleMutate).toHaveBeenCalledWith({
      userId: "user-1",
      tenantId: "t-1",
      role: "admin",
    });
  });

  it("propagates tRPC errors", async () => {
    mockTenantChangeRoleMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(changeRole("u", "t", "admin")).rejects.toThrow("Forbidden");
  });
});

describe("banTenant", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls banTenant with all required fields", async () => {
    mockBanTenantMutate.mockResolvedValue(undefined);

    await banTenant("t-1", "TOS violation", "section-3.2", "Test Org");
    expect(mockBanTenantMutate).toHaveBeenCalledWith({
      tenantId: "t-1",
      reason: "TOS violation",
      tosReference: "section-3.2",
      confirmName: "Test Org",
    });
  });

  it("propagates tRPC errors", async () => {
    mockBanTenantMutate.mockRejectedValue(new Error("Name mismatch"));
    await expect(banTenant("t-1", "r", "s", "wrong")).rejects.toThrow("Name mismatch");
  });
});

describe("getTransactionsCsv", () => {
  afterEach(() => vi.clearAllMocks());

  it("unwraps csv string from response", async () => {
    mockCreditsTransactionsExportQuery.mockResolvedValue({ csv: "id,amount\n1,100" });

    const result = await getTransactionsCsv("t-1");
    expect(result).toBe("id,amount\n1,100");
    expect(mockCreditsTransactionsExportQuery).toHaveBeenCalledWith({ tenantId: "t-1" });
  });

  it("propagates tRPC errors", async () => {
    mockCreditsTransactionsExportQuery.mockRejectedValue(new Error("Server error"));
    await expect(getTransactionsCsv("t-1")).rejects.toThrow("Server error");
  });
});

describe("getTransactions", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes tenantId and optional filters", async () => {
    const response = { entries: [], total: 0 };
    mockCreditsTransactionsQuery.mockResolvedValue(response);

    const result = await getTransactions("t-1", { type: "grant", limit: 10 });
    expect(result).toEqual(response);
    expect(mockCreditsTransactionsQuery).toHaveBeenCalledWith({
      tenantId: "t-1",
      type: "grant",
      limit: 10,
    });
  });

  it("works without filters", async () => {
    mockCreditsTransactionsQuery.mockResolvedValue({ entries: [], total: 0 });

    await getTransactions("t-1");
    expect(mockCreditsTransactionsQuery).toHaveBeenCalledWith({ tenantId: "t-1" });
  });

  it("propagates tRPC errors", async () => {
    mockCreditsTransactionsQuery.mockRejectedValue(new Error("Bad request"));
    await expect(getTransactions("t-1")).rejects.toThrow("Bad request");
  });
});

describe("getTenantUsageByCapability", () => {
  afterEach(() => vi.clearAllMocks());

  it("unwraps usage array and defaults days to 30", async () => {
    const usage = [
      {
        tenant: "t-1",
        capability: "tts",
        provider: "deepgram",
        event_count: 10,
        total_cost: 1,
        total_charge: 2,
        total_duration: 60,
        window_start: 1000,
        window_end: 2000,
      },
    ];
    mockTenantUsageByCapabilityQuery.mockResolvedValue({ usage });

    const result = await getTenantUsageByCapability("t-1");
    expect(result).toEqual(usage);
    expect(mockTenantUsageByCapabilityQuery).toHaveBeenCalledWith({ tenantId: "t-1", days: 30 });
  });

  it("passes custom days parameter", async () => {
    mockTenantUsageByCapabilityQuery.mockResolvedValue({ usage: [] });

    await getTenantUsageByCapability("t-1", 7);
    expect(mockTenantUsageByCapabilityQuery).toHaveBeenCalledWith({ tenantId: "t-1", days: 7 });
  });

  it("propagates tRPC errors", async () => {
    mockTenantUsageByCapabilityQuery.mockRejectedValue(new Error("Timeout"));
    await expect(getTenantUsageByCapability("t-1")).rejects.toThrow("Timeout");
  });
});

describe("getUsersList", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes search params to tRPC", async () => {
    const response = { users: [], total: 0 };
    mockUsersListQuery.mockResolvedValue(response);

    const result = await getUsersList({ search: "test", limit: 20 });
    expect(result).toEqual(response);
    expect(mockUsersListQuery).toHaveBeenCalledWith({ search: "test", limit: 20 });
  });

  it("passes empty object when called with no args", async () => {
    mockUsersListQuery.mockResolvedValue({ users: [], total: 0 });

    await getUsersList();
    expect(mockUsersListQuery).toHaveBeenCalledWith({});
  });

  it("propagates tRPC errors", async () => {
    mockUsersListQuery.mockRejectedValue(new Error("Forbidden"));
    await expect(getUsersList()).rejects.toThrow("Forbidden");
  });
});

describe("bulkGrantCredits", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls bulkGrant with tenantIds, amountCents, reason", async () => {
    mockBulkGrantMutate.mockResolvedValue({});

    await bulkGrantCredits(["t-1", "t-2"], 500, "Promo");
    expect(mockBulkGrantMutate).toHaveBeenCalledWith({
      tenantIds: ["t-1", "t-2"],
      amountCents: 500,
      reason: "Promo",
    });
  });

  it("propagates tRPC errors", async () => {
    mockBulkGrantMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(bulkGrantCredits([], 0, "")).rejects.toThrow("Forbidden");
  });
});

describe("bulkSuspendTenants", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls bulkSuspend with tenantIds and reason", async () => {
    mockBulkSuspendMutate.mockResolvedValue({});

    await bulkSuspendTenants(["t-1"], "Policy violation");
    expect(mockBulkSuspendMutate).toHaveBeenCalledWith({
      tenantIds: ["t-1"],
      reason: "Policy violation",
    });
  });

  it("propagates tRPC errors", async () => {
    mockBulkSuspendMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(bulkSuspendTenants([], "")).rejects.toThrow("Forbidden");
  });
});

describe("bulkReactivateTenants", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls bulkReactivate with tenantIds", async () => {
    mockBulkReactivateMutate.mockResolvedValue({});

    await bulkReactivateTenants(["t-1", "t-2"]);
    expect(mockBulkReactivateMutate).toHaveBeenCalledWith({ tenantIds: ["t-1", "t-2"] });
  });

  it("propagates tRPC errors", async () => {
    mockBulkReactivateMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(bulkReactivateTenants([])).rejects.toThrow("Forbidden");
  });
});
