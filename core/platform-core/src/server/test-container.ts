/**
 * createTestContainer — builds a PlatformContainer with sensible mock
 * defaults for unit tests. All feature sub-containers default to null.
 * Core services get minimal stubs that satisfy their interfaces.
 *
 * Usage:
 *   const c = createTestContainer();
 *   const c2 = createTestContainer({ creditLedger: myCustomLedger });
 */

import type { IUserRoleRepository } from "../auth/user-role-repository.js";
import type { ILedger } from "../credits/ledger.js";
import type { DrizzleDb } from "../db/index.js";
import type { ProductConfig } from "../product-config/repository-types.js";
import { ProductConfigService } from "../product-config/service.js";
import type { IOrgMemberRepository } from "../tenancy/org-member-repository.js";
import type { OrgService } from "../tenancy/org-service.js";
import type { PlatformContainer } from "./container.js";

// ---------------------------------------------------------------------------
// Stub factories (satisfy interface contracts with no-op implementations)
// ---------------------------------------------------------------------------

function stubLedger(): ILedger {
  const zero = 0 as never;
  const emptyEntry = {} as never;
  return {
    post: async () => emptyEntry,
    credit: async () => emptyEntry,
    debit: async () => emptyEntry,
    balance: async () => zero,
    hasReferenceId: async () => false,
    history: async () => [],
    tenantsWithBalance: async () => [],
    memberUsage: async () => [],
    lifetimeSpend: async () => zero,
    lifetimeSpendBatch: async () => new Map(),
    expiredCredits: async () => [],
    trialBalance: async () => ({ balanced: true }) as never,
    accountBalance: async () => zero,
    seedSystemAccounts: async () => {},
    existsByReferenceIdLike: async () => false,
    sumPurchasesForPeriod: async () => zero,
    getActiveTenantIdsInWindow: async () => [],
    debitCapped: async () => null,
  };
}

function stubOrgMemberRepo(): IOrgMemberRepository {
  return {
    listMembers: async () => [],
    addMember: async () => {},
    updateMemberRole: async () => {},
    removeMember: async () => {},
    findMember: async () => null,
    countAdminsAndOwners: async () => 0,
    listInvites: async () => [],
    createInvite: async () => {},
    findInviteById: async () => null,
    findInviteByToken: async () => null,
    deleteInvite: async () => {},
    deleteAllMembers: async () => {},
    deleteAllInvites: async () => {},
    listOrgsByUser: async () => [],
    markInviteAccepted: async () => {},
  };
}

function stubUserRoleRepo(): IUserRoleRepository {
  return {
    getTenantIdByUserId: async () => null,
    grantRole: async () => {},
    revokeRole: async () => false,
    listRolesByUser: async () => [],
    listUsersByRole: async () => [],
    isPlatformAdmin: async () => false,
  };
}

function stubProductConfig(): ProductConfig {
  return {
    product: {
      slug: "test",
      name: "Test Product",
    } as never,
    navItems: [],
    domains: [],
    features: null,
    fleet: null,
    billing: null,
  };
}

function stubProductConfigService(): ProductConfigService {
  const stubRepo = {
    getBySlug: async () => stubProductConfig(),
    listAll: async () => [],
    upsertProduct: async () => stubProductConfig().product,
    replaceNavItems: async () => {},
    upsertFeatures: async () => {},
    upsertFleetConfig: async () => {},
    upsertBillingConfig: async () => {},
  };
  return new ProductConfigService(stubRepo as never);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a PlatformContainer pre-filled with no-op stubs.
 * Pass overrides for any field you need to customize in your test.
 */
export function createTestContainer(overrides?: Partial<PlatformContainer>): PlatformContainer {
  const defaults: PlatformContainer = {
    db: {} as DrizzleDb,
    pool: { end: async () => {} } as never,
    productConfig: stubProductConfig(),
    productConfigService: stubProductConfigService(),
    creditLedger: stubLedger(),
    orgMemberRepo: stubOrgMemberRepo(),
    orgService: {} as OrgService,
    userRoleRepo: stubUserRoleRepo(),

    // Feature sub-containers default to null (not enabled)
    fleet: null,
    crypto: null,
    stripe: null,
    gateway: null,
    hotPool: null,
  };

  return { ...defaults, ...overrides };
}
