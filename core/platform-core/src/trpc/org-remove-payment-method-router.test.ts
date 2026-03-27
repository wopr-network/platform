import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IPaymentProcessor, SavedPaymentMethod } from "../billing/payment-processor.js";
import type { AutoTopupSettings, IAutoTopupSettingsRepository } from "../credits/auto-topup-settings-repository.js";
import type { IOrgMemberRepository } from "../tenancy/org-member-repository.js";
import { createCallerFactory, router, setTrpcOrgMemberRepo } from "./init.js";
import { createOrgRemovePaymentMethodRouter } from "./org-remove-payment-method-router.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockOrgMemberRepo(overrides?: Partial<IOrgMemberRepository>): IOrgMemberRepository {
  return {
    listMembers: vi.fn().mockResolvedValue([]),
    addMember: vi.fn().mockResolvedValue(undefined),
    updateMemberRole: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    findMember: vi.fn().mockResolvedValue({ userId: "u1", role: "owner" }),
    countAdminsAndOwners: vi.fn().mockResolvedValue(1),
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

function makeMockProcessor(methods: SavedPaymentMethod[]): IPaymentProcessor {
  return {
    name: "mock",
    createCheckoutSession: vi.fn(),
    handleWebhook: vi.fn(),
    supportsPortal: vi.fn().mockReturnValue(false),
    createPortalSession: vi.fn(),
    setupPaymentMethod: vi.fn(),
    listPaymentMethods: vi.fn().mockResolvedValue(methods),
    charge: vi.fn(),
    detachPaymentMethod: vi.fn().mockResolvedValue(undefined),
    getCustomerEmail: vi.fn().mockResolvedValue(""),
    updateCustomerEmail: vi.fn(),
    listInvoices: vi.fn().mockResolvedValue([]),
    setDefaultPaymentMethod: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockAutoTopupSettings(overrides?: Partial<AutoTopupSettings>): IAutoTopupSettingsRepository {
  const settings: AutoTopupSettings | null = overrides
    ? ({
        tenantId: "org-1",
        usageEnabled: false,
        usageThreshold: { toCentsRounded: () => 0 },
        usageTopup: { toCentsRounded: () => 0 },
        usageConsecutiveFailures: 0,
        usageChargeInFlight: false,
        scheduleEnabled: false,
        scheduleAmount: { toCentsRounded: () => 0 },
        scheduleIntervalHours: 0,
        scheduleNextAt: null,
        scheduleConsecutiveFailures: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
      } as AutoTopupSettings)
    : null;

  return {
    getByTenant: vi.fn().mockResolvedValue(settings),
    upsert: vi.fn(),
    setUsageChargeInFlight: vi.fn(),
    tryAcquireUsageInFlight: vi.fn(),
    incrementUsageFailures: vi.fn(),
    resetUsageFailures: vi.fn(),
    disableUsage: vi.fn(),
    incrementScheduleFailures: vi.fn(),
    resetScheduleFailures: vi.fn(),
    disableSchedule: vi.fn(),
    advanceScheduleNextAt: vi.fn(),
    listDueScheduled: vi.fn().mockResolvedValue([]),
    getMaxConsecutiveFailures: vi.fn().mockResolvedValue(0),
  };
}

function authedContext() {
  return { user: { id: "u1", roles: ["user"] }, tenantId: "org-1" };
}

function unauthedContext() {
  return { user: undefined, tenantId: undefined };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("orgRemovePaymentMethod router", () => {
  let processor: IPaymentProcessor;
  let autoTopupStore: IAutoTopupSettingsRepository;

  beforeEach(() => {
    processor = makeMockProcessor([{ id: "pm_1", label: "Visa ending 4242", isDefault: true }]);
    autoTopupStore = makeMockAutoTopupSettings();
    setTrpcOrgMemberRepo(makeMockOrgMemberRepo());
  });

  function buildCaller(deps: { processor: IPaymentProcessor; autoTopupSettingsStore?: IAutoTopupSettingsRepository }) {
    const subRouter = createOrgRemovePaymentMethodRouter(() => ({
      processor: deps.processor,
      autoTopupSettingsStore: deps.autoTopupSettingsStore,
    }));
    const appRouter = router({ org: subRouter });
    return createCallerFactory(appRouter);
  }

  it("successfully removes a payment method", async () => {
    const caller = buildCaller({ processor, autoTopupSettingsStore: autoTopupStore })(authedContext());
    const result = await caller.org.orgRemovePaymentMethod({
      orgId: "org-1",
      paymentMethodId: "pm_1",
    });
    expect(result).toEqual({ removed: true });
    expect(processor.detachPaymentMethod).toHaveBeenCalledWith("org-1", "pm_1");
  });

  it("rejects unauthenticated users", async () => {
    const caller = buildCaller({ processor, autoTopupSettingsStore: autoTopupStore })(unauthedContext());
    await expect(caller.org.orgRemovePaymentMethod({ orgId: "org-1", paymentMethodId: "pm_1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects when removing last PM with auto-topup usage enabled", async () => {
    const usageStore = makeMockAutoTopupSettings({ usageEnabled: true });
    const caller = buildCaller({
      processor,
      autoTopupSettingsStore: usageStore,
    })(authedContext());
    await expect(caller.org.orgRemovePaymentMethod({ orgId: "org-1", paymentMethodId: "pm_1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects when removing last PM with auto-topup schedule enabled", async () => {
    const scheduleStore = makeMockAutoTopupSettings({ scheduleEnabled: true });
    const caller = buildCaller({
      processor,
      autoTopupSettingsStore: scheduleStore,
    })(authedContext());
    await expect(caller.org.orgRemovePaymentMethod({ orgId: "org-1", paymentMethodId: "pm_1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows removing non-last PM even with auto-topup enabled", async () => {
    const multiProcessor = makeMockProcessor([
      { id: "pm_1", label: "Visa ending 4242", isDefault: true },
      { id: "pm_2", label: "Mastercard ending 5555", isDefault: false },
    ]);
    const usageStore = makeMockAutoTopupSettings({ usageEnabled: true });
    const caller = buildCaller({
      processor: multiProcessor,
      autoTopupSettingsStore: usageStore,
    })(authedContext());
    const result = await caller.org.orgRemovePaymentMethod({
      orgId: "org-1",
      paymentMethodId: "pm_1",
    });
    expect(result).toEqual({ removed: true });
  });

  it("returns FORBIDDEN when detachPaymentMethod throws PaymentMethodOwnershipError", async () => {
    const { PaymentMethodOwnershipError } = await import("../billing/payment-processor.js");
    const ownershipErrorProcessor = makeMockProcessor([]);
    (ownershipErrorProcessor.detachPaymentMethod as ReturnType<typeof vi.fn>).mockRejectedValue(
      new PaymentMethodOwnershipError(),
    );
    const caller = buildCaller({
      processor: ownershipErrorProcessor,
      autoTopupSettingsStore: autoTopupStore,
    })(authedContext());
    await expect(caller.org.orgRemovePaymentMethod({ orgId: "org-1", paymentMethodId: "pm_1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
