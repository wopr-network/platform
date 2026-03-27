/**
 * AppRouter type stub for wopr-platform.
 *
 * NOTE(WOP-1189): The platform backend is a separate repo (wopr-network/wopr-platform)
 * and @wopr-network/wopr-platform is not published on npm. Using a local `link:`
 * dependency breaks CI (ERR_PNPM_LOCKFILE_CONFIG_MISMATCH — the path doesn't exist
 * on GitHub Actions runners). This stub re-declares the procedures consumed by the UI
 * so the build stays type-safe without a local path dependency.
 *
 * When @wopr-network/sdk is published, replace this file with:
 *   export type { AppRouter } from "@wopr-network/sdk";
 *
 * The real AppRouter type lives at:
 *   wopr-network/wopr-platform/src/trpc/index.ts → `export type AppRouter = typeof appRouter;`
 */
import type {
  AnyTRPCMutationProcedure,
  AnyTRPCQueryProcedure,
  AnyTRPCRootTypes,
  TRPCBuiltRouter,
} from "@trpc/server";

/**
 * Minimal router record for the procedures this UI consumes.
 * Extend this when adding new tRPC calls. Remove entries when procedures are dropped.
 */
type AppRouterRecord = {
  pageContext: {
    update: AnyTRPCMutationProcedure;
  };
  admin: {
    inference: {
      dailyCost: AnyTRPCQueryProcedure;
      pageCost: AnyTRPCQueryProcedure;
      cacheHitRate: AnyTRPCQueryProcedure;
      sessionCost: AnyTRPCQueryProcedure;
    };
    billingHealth: AnyTRPCQueryProcedure;
    tenantDetail: AnyTRPCQueryProcedure;
    tenantAgents: AnyTRPCQueryProcedure;
    notesList: AnyTRPCQueryProcedure;
    notesCreate: AnyTRPCMutationProcedure;
    suspendTenant: AnyTRPCMutationProcedure;
    reactivateTenant: AnyTRPCMutationProcedure;
    creditsGrant: AnyTRPCMutationProcedure;
    creditsRefund: AnyTRPCMutationProcedure;
    tenantChangeRole: AnyTRPCMutationProcedure;
    banTenant: AnyTRPCMutationProcedure;
    creditsTransactionsExport: AnyTRPCQueryProcedure;
    creditsTransactions: AnyTRPCQueryProcedure;
    tenantUsageByCapability: AnyTRPCQueryProcedure;
    usersList: AnyTRPCQueryProcedure;
    bulkGrant: AnyTRPCMutationProcedure;
    bulkSuspend: AnyTRPCMutationProcedure;
    bulkReactivate: AnyTRPCMutationProcedure;
    affiliateSuppressions: AnyTRPCQueryProcedure;
    affiliateVelocity: AnyTRPCQueryProcedure;
    affiliateFingerprintClusters: AnyTRPCQueryProcedure;
    affiliateBlockFingerprint: AnyTRPCMutationProcedure;
    complianceDeletionRequests: AnyTRPCQueryProcedure;
    complianceTriggerDeletion: AnyTRPCMutationProcedure;
    complianceCancelDeletion: AnyTRPCMutationProcedure;
    complianceExportRequests: AnyTRPCQueryProcedure;
    complianceTriggerExport: AnyTRPCMutationProcedure;
    onboardingFunnelStats: AnyTRPCQueryProcedure;
    onboardingScriptList: AnyTRPCQueryProcedure;
    onboardingScriptSave: AnyTRPCMutationProcedure;
    rolesList: AnyTRPCQueryProcedure;
    rolesAssign: AnyTRPCMutationProcedure;
    rolesRevoke: AnyTRPCMutationProcedure;
    migrationList: AnyTRPCQueryProcedure;
    migrationSnapshotList: AnyTRPCQueryProcedure;
    migrationRestore: AnyTRPCMutationProcedure;
    migrationRestoreHistory: AnyTRPCQueryProcedure;
    retentionPolicies: AnyTRPCQueryProcedure;
    retentionPoliciesUpdate: AnyTRPCMutationProcedure;
    getGatewayModel: AnyTRPCQueryProcedure;
    setGatewayModel: AnyTRPCMutationProcedure;
    listAllInstances: AnyTRPCQueryProcedure;
    listAllOrgs: AnyTRPCQueryProcedure;
    billingOverview: AnyTRPCQueryProcedure;
    listAvailableModels: AnyTRPCQueryProcedure;
    getPoolConfig: AnyTRPCQueryProcedure;
    setPoolSize: AnyTRPCMutationProcedure;
  };
  promotions: {
    list: AnyTRPCQueryProcedure;
    get: AnyTRPCQueryProcedure;
    create: AnyTRPCMutationProcedure;
    update: AnyTRPCMutationProcedure;
    activate: AnyTRPCMutationProcedure;
    pause: AnyTRPCMutationProcedure;
    cancel: AnyTRPCMutationProcedure;
    generateCouponBatch: AnyTRPCMutationProcedure;
    listRedemptions: AnyTRPCQueryProcedure;
  };
  rateOverrides: {
    list: AnyTRPCQueryProcedure;
    create: AnyTRPCMutationProcedure;
    cancel: AnyTRPCMutationProcedure;
  };
  billing: {
    applyCoupon: AnyTRPCMutationProcedure;
    currentPlan: AnyTRPCQueryProcedure;
    providerCosts: AnyTRPCQueryProcedure;
    billingInfo: AnyTRPCQueryProcedure;
    creditsBalance: AnyTRPCQueryProcedure;
    creditsHistory: AnyTRPCQueryProcedure;
    creditsCheckout: AnyTRPCMutationProcedure;
    creditOptions: AnyTRPCQueryProcedure;
    inferenceMode: AnyTRPCQueryProcedure;
    spendingLimits: AnyTRPCQueryProcedure;
    updateSpendingLimits: AnyTRPCMutationProcedure;
    hostedUsageSummary: AnyTRPCQueryProcedure;
    usageSummary: AnyTRPCQueryProcedure;
    hostedUsageEvents: AnyTRPCQueryProcedure;
    portalSession: AnyTRPCMutationProcedure;
    updateBillingEmail: AnyTRPCMutationProcedure;
    removePaymentMethod: AnyTRPCMutationProcedure;
    setDefaultPaymentMethod: AnyTRPCMutationProcedure;
    affiliateStats: AnyTRPCQueryProcedure;
    affiliateReferrals: AnyTRPCQueryProcedure;
    checkout: AnyTRPCMutationProcedure;
    chargeStatus: AnyTRPCQueryProcedure;
    supportedPaymentMethods: AnyTRPCQueryProcedure;
    adminListPaymentMethods: AnyTRPCQueryProcedure;
    adminUpsertPaymentMethod: AnyTRPCMutationProcedure;
    adminTogglePaymentMethod: AnyTRPCMutationProcedure;
    autoTopupSettings: AnyTRPCQueryProcedure;
    updateAutoTopupSettings: AnyTRPCMutationProcedure;
    accountStatus: AnyTRPCQueryProcedure;
  };
  fleet: {
    listInstances: AnyTRPCQueryProcedure;
    getInstance: AnyTRPCQueryProcedure;
    createInstance: AnyTRPCMutationProcedure;
    controlInstance: AnyTRPCMutationProcedure;
    getInstanceHealth: AnyTRPCQueryProcedure;
    getInstanceLogs: AnyTRPCQueryProcedure;
    getInstanceMetrics: AnyTRPCQueryProcedure;
    listTemplates: AnyTRPCQueryProcedure;
    getChangelog: AnyTRPCQueryProcedure;
  };
  settings: {
    notificationPreferences: AnyTRPCQueryProcedure;
    updateNotificationPreferences: AnyTRPCMutationProcedure;
  };
  capabilities: {
    storeKey: AnyTRPCMutationProcedure;
    testKey: AnyTRPCMutationProcedure;
    listCapabilitySettings: AnyTRPCQueryProcedure;
    updateCapabilitySettings: AnyTRPCMutationProcedure;
    listCapabilityMeta: AnyTRPCQueryProcedure;
  };
  authSocial: {
    enabledSocialProviders: AnyTRPCQueryProcedure;
  };
  profile: {
    getProfile: AnyTRPCQueryProcedure;
    updateProfile: AnyTRPCMutationProcedure;
    changePassword: AnyTRPCMutationProcedure;
  };
  org: {
    getOrganization: AnyTRPCQueryProcedure;
    createOrganization: AnyTRPCMutationProcedure;
    updateOrganization: AnyTRPCMutationProcedure;
    inviteMember: AnyTRPCMutationProcedure;
    revokeInvite: AnyTRPCMutationProcedure;
    changeRole: AnyTRPCMutationProcedure;
    removeMember: AnyTRPCMutationProcedure;
    transferOwnership: AnyTRPCMutationProcedure;
    deleteOrganization: AnyTRPCMutationProcedure;
    listMyOrganizations: AnyTRPCQueryProcedure;
    acceptInvite: AnyTRPCMutationProcedure;
    orgBillingBalance: AnyTRPCQueryProcedure;
    orgMemberUsage: AnyTRPCQueryProcedure;
    orgBillingInfo: AnyTRPCQueryProcedure;
    orgTopupCheckout: AnyTRPCMutationProcedure;
    orgSetupIntent: AnyTRPCMutationProcedure;
    orgRemovePaymentMethod: AnyTRPCMutationProcedure;
    orgSetDefaultPaymentMethod: AnyTRPCMutationProcedure;
  };
  /** Separate from `fleet` — backed by createFleetUpdateConfigRouter in platform-core. */
  fleetUpdateConfig: {
    getUpdateConfig: AnyTRPCQueryProcedure;
    setUpdateConfig: AnyTRPCMutationProcedure;
  };
  /** Admin-only: DB-driven email template management. */
  notificationTemplates: {
    listTemplates: AnyTRPCQueryProcedure;
    getTemplate: AnyTRPCQueryProcedure;
    updateTemplate: AnyTRPCMutationProcedure;
    previewTemplate: AnyTRPCMutationProcedure;
    seedDefaults: AnyTRPCMutationProcedure;
  };
  /** Admin-only: fleet rollout management. */
  adminFleetUpdate: {
    rolloutStatus: AnyTRPCQueryProcedure;
    forceRollout: AnyTRPCMutationProcedure;
    listTenantConfigs: AnyTRPCQueryProcedure;
    setTenantConfig: AnyTRPCMutationProcedure;
  };
  adminMarketplace: {
    listPlugins: AnyTRPCQueryProcedure;
    updatePlugin: AnyTRPCMutationProcedure;
    addPlugin: AnyTRPCMutationProcedure;
  };
  /** Hot pool instance claim. */
  pool: {
    claim: AnyTRPCMutationProcedure;
  };
};

export type AppRouter = TRPCBuiltRouter<AnyTRPCRootTypes, AppRouterRecord>;
