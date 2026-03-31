/**
 * tRPC admin-core router — audit log, credits, users, tenant status,
 * notifications, billing health, compliance, notes, analytics, bulk,
 * and rate management procedures.
 *
 * Contains the 54 generic admin procedures shared across all products.
 * Product-specific admin procedures (GPU, affiliate, etc.) stay
 * in each product's own admin router.
 *
 * Pure platform-core — all deps injected via factory pattern.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { AnalyticsStore } from "../../admin/analytics/analytics-store.js";
import type { AdminAuditLog } from "../../admin/audit-log.js";
import type { IBulkOperationsStore } from "../../admin/bulk/bulk-operations-store.js";
import type { IAdminNotesRepository } from "../../admin/notes/admin-notes-repository.js";
import type { RateStore } from "../../admin/rates/rate-store.js";
import type { RoleStore } from "../../admin/role-store.js";
import type { ITenantStatusRepository } from "../../admin/tenant-status/tenant-status-repository.js";
import { logger } from "../../config/logger.js";
import { Credit } from "../../credits/credit.js";
import type { IAutoTopupSettingsRepository } from "../../credits/index.js";
import type { ILedger } from "../../credits/ledger.js";
import type { INotificationQueueRepository, NotificationService } from "../../email/index.js";
import type { IMeterAggregator } from "../../metering/index.js";
import type { PaymentHealthStatus } from "../../monetization/incident/health-probe.js";
import type { AlertChecker } from "../../observability/alerts.js";
import type { MetricsCollector } from "../../observability/metrics.js";
import type { SystemResourceMonitor, SystemResourceSnapshot } from "../../observability/system-resources.js";
import { adminProcedure, router } from "../init.js";

// ---------------------------------------------------------------------------
// Admin store interfaces (being moved into platform-core by another agent)
// Import from ../admin/ — these interfaces will be available once the
// admin stores extraction is complete.
// ---------------------------------------------------------------------------

/** Admin user store interface — abstracts user listing/lookup for admin panel. */
export interface IAdminUserStore {
  list(filters: {
    search?: string;
    status?: string;
    role?: string;
    hasCredits?: boolean;
    lowBalance?: boolean;
    sortBy?: string;
    sortOrder?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: unknown[]; total: number; limit: number; offset: number }>;
  getById(userId: string): Promise<unknown | null>;
}

/** Account export store interface — GDPR data export requests. */
export interface IAccountExportStore {
  create(
    tenantId: string,
    requestedBy: string,
    format?: string,
  ): Promise<{ id: string; tenantId: string; status: string }>;
  getById(id: string): Promise<{ id: string; tenantId: string; status: string } | null>;
  list(filters: { status?: string; limit: number; offset: number }): Promise<{ requests: unknown[]; total: number }>;
}

/** Account deletion store interface — right-to-be-forgotten requests. */
export interface IAccountDeletionStore {
  create(
    tenantId: string,
    requestedBy: string,
    reason?: string | null,
  ): Promise<{ id: string; tenantId: string; status: string }>;
  getById(id: string): Promise<{ id: string; tenantId: string; status: string } | null>;
  getPendingForTenant(tenantId: string): Promise<{ id: string } | null>;
  cancel(id: string, reason: string): Promise<void>;
  list(opts: { status?: string; limit: number; offset: number }): Promise<{ requests: unknown[]; total: number }>;
}

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface AdminCoreRouterDeps {
  getAuditLog: () => AdminAuditLog;
  getCreditLedger: () => ILedger;
  getUserStore: () => IAdminUserStore;
  getTenantStatusStore: () => ITenantStatusRepository;
  getRoleStore?: () => RoleStore;
  getNotificationService?: () => NotificationService;
  getNotificationQueueStore?: () => INotificationQueueRepository;
  getMeterAggregator?: () => IMeterAggregator;
  getAutoTopupSettingsRepo?: () => IAutoTopupSettingsRepository;
  getExportStore?: () => IAccountExportStore;
  getAccountDeletionStore?: () => IAccountDeletionStore;
  // Phase 2 stores: notes, analytics, bulk, rates
  getNotesStore?: () => IAdminNotesRepository;
  getAnalyticsStore?: () => AnalyticsStore;
  getBulkStore?: () => IBulkOperationsStore;
  getRateStore?: () => RateStore;
  /** Detach all Stripe payment methods for a tenant. Returns count detached. */
  detachAllPaymentMethods?: (tenantId: string) => Promise<number>;
  /** Suspend all product instances for a tenant. Returns list of suspended IDs. */
  suspendAllForTenant?: (tenantId: string) => Promise<string[]>;
  /** Look up tenant email by ID (for email notifications on suspend/reactivate). */
  lookupTenantEmail?: (tenantId: string) => Promise<string | null>;
  // Billing health deps
  getMetricsCollector?: () => MetricsCollector;
  getAlertChecker?: () => AlertChecker;
  getSystemResourceMonitor?: () => SystemResourceMonitor;
  probePaymentHealth?: () => Promise<PaymentHealthStatus>;
  queryActiveInstances?: () => number | Promise<number>;
  queryActiveTenantCount?: () => number | Promise<number>;
}

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const tenantIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

const VALID_STATUSES = ["active", "suspended", "grace_period", "dormant"] as const;
const VALID_ROLES = ["platform_admin", "tenant_admin", "user"] as const;
const VALID_SORT_BY = ["last_seen", "created_at", "balance", "agent_count"] as const;
const VALID_SORT_ORDER = ["asc", "desc"] as const;

const dateRangeSchema = z.object({
  from: z.number().int().positive(),
  to: z.number().int().positive(),
});

const VALID_CSV_SECTIONS = [
  "revenue_overview",
  "revenue_breakdown",
  "margin_by_capability",
  "provider_spend",
  "tenant_health",
  "time_series",
  "auto_topup",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRange(input: { from?: number; to?: number }): { from: number; to: number } {
  const to = input.to ?? Date.now();
  const from = input.from ?? to - 30 * 24 * 60 * 60 * 1000; // 30 days
  return { from, to };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAdminCoreRouter(d: AdminCoreRouterDeps) {
  return router({
    // ---------------------------------------------------------------------
    // Audit Log (2 procedures)
    // ---------------------------------------------------------------------

    /** Query admin audit log entries. */
    auditLog: adminProcedure
      .input(
        z.object({
          admin: z.string().optional(),
          action: z.string().optional(),
          category: z.string().optional(),
          tenant: z.string().optional(),
          from: z.number().int().optional(),
          to: z.number().int().optional(),
          limit: z.number().int().positive().max(1000).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(({ input }) => {
        return d.getAuditLog().query(input);
      }),

    /** Export admin audit log as CSV. */
    auditLogExport: adminProcedure
      .input(
        z.object({
          admin: z.string().optional(),
          action: z.string().optional(),
          category: z.string().optional(),
          tenant: z.string().optional(),
          from: z.number().int().optional(),
          to: z.number().int().optional(),
        }),
      )
      .query(({ input }) => {
        return { csv: d.getAuditLog().exportCsv(input) };
      }),

    // ---------------------------------------------------------------------
    // Credits (6 procedures)
    // ---------------------------------------------------------------------

    /** Get credits balance for a tenant. */
    creditsBalance: adminProcedure.input(z.object({ tenantId: tenantIdSchema })).query(async ({ input }) => {
      const balance = await d.getCreditLedger().balance(input.tenantId);
      return { tenant: input.tenantId, balance_credits: balance.toCents() };
    }),

    /** Grant credits to a tenant. */
    creditsGrant: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          amount_cents: z.number().int().positive(),
          reason: z.string().min(1),
          expiresAt: z.string().datetime().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const adminUser = ctx.user?.id ?? "unknown";
        try {
          const result = await d
            .getCreditLedger()
            .credit(input.tenantId, Credit.fromCents(input.amount_cents), "admin_grant", {
              description: input.reason,
              expiresAt: input.expiresAt,
            });
          d.getAuditLog().log({
            adminUser,
            action: "credits.grant",
            category: "credits",
            targetTenant: input.tenantId,
            details: {
              amount_cents: input.amount_cents,
              reason: input.reason,
              expiresAt: input.expiresAt,
            },
            outcome: "success",
          });
          return result;
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "credits.grant",
            category: "credits",
            targetTenant: input.tenantId,
            details: {
              amount_cents: input.amount_cents,
              reason: input.reason,
              error: String(err),
            },
            outcome: "failure",
          });
          throw err;
        }
      }),

    /** Refund credits from a tenant. */
    creditsRefund: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          amount_cents: z.number().int().positive(),
          reason: z.string().min(1),
          reference_ids: z.array(z.string()).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const adminUser = ctx.user?.id ?? "unknown";
        try {
          const result = await d
            .getCreditLedger()
            .debit(input.tenantId, Credit.fromCents(input.amount_cents), "refund", { description: input.reason });
          d.getAuditLog().log({
            adminUser,
            action: "credits.refund",
            category: "credits",
            targetTenant: input.tenantId,
            details: {
              amount_cents: input.amount_cents,
              reason: input.reason,
              reference_ids: input.reference_ids,
            },
            outcome: "success",
          });
          return result;
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "credits.refund",
            category: "credits",
            targetTenant: input.tenantId,
            details: {
              amount_cents: input.amount_cents,
              reason: input.reason,
              reference_ids: input.reference_ids,
              error: String(err),
            },
            outcome: "failure",
          });
          throw err;
        }
      }),

    /** Apply a credit correction (positive or negative). */
    creditsCorrection: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          amount_cents: z
            .number()
            .int()
            .refine((v) => v !== 0, "amount_cents must be non-zero"),
          reason: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const adminUser = ctx.user?.id ?? "unknown";
        try {
          const result = await (input.amount_cents >= 0
            ? d.getCreditLedger().credit(input.tenantId, Credit.fromCents(input.amount_cents), "promo", {
                description: input.reason,
              })
            : d.getCreditLedger().debit(input.tenantId, Credit.fromCents(Math.abs(input.amount_cents)), "correction", {
                description: input.reason,
              }));
          d.getAuditLog().log({
            adminUser,
            action: "credits.correction",
            category: "credits",
            targetTenant: input.tenantId,
            details: { amount_cents: input.amount_cents, reason: input.reason },
            outcome: "success",
          });
          return result;
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "credits.correction",
            category: "credits",
            targetTenant: input.tenantId,
            details: {
              amount_cents: input.amount_cents,
              reason: input.reason,
              error: String(err),
            },
            outcome: "failure",
          });
          throw err;
        }
      }),

    /** List credit transactions for a tenant. */
    creditsTransactions: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          type: z.enum(["grant", "admin_grant", "refund", "correction"]).optional(),
          from: z.number().int().optional(),
          to: z.number().int().optional(),
          limit: z.number().int().positive().max(1000).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(async ({ input }) => {
        const { tenantId, ...filters } = input;
        const entries = await d.getCreditLedger().history(tenantId, filters);
        return { entries, total: entries.length };
      }),

    /** Export credit transactions as CSV. */
    creditsTransactionsExport: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          type: z.enum(["grant", "admin_grant", "refund", "correction"]).optional(),
          from: z.number().int().optional(),
          to: z.number().int().optional(),
        }),
      )
      .query(async ({ input }) => {
        const { tenantId, ...filters } = input;
        const entries = await d.getCreditLedger().history(tenantId, { ...filters, limit: 10000 });

        const header = "id,tenantId,type,amountCents,description,referenceId,postedAt";
        const csvEscape = (v: string): string => {
          let s = v;
          if (/^[=+\-@]/.test(s)) s = `'${s}`;
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = entries.map((r) => {
          const tenantLine = r.lines.find((l) => l.accountCode === `2000:${r.tenantId}`);
          const amountCents = tenantLine
            ? tenantLine.amount.toCentsRounded() * (tenantLine.side === "debit" ? -1 : 1)
            : 0;
          return [
            csvEscape(r.id),
            csvEscape(r.tenantId),
            csvEscape(r.entryType),
            String(amountCents),
            csvEscape(r.description ?? ""),
            csvEscape(r.referenceId ?? ""),
            csvEscape(r.postedAt),
          ].join(",");
        });

        return { csv: [header, ...lines].join("\n") };
      }),

    // ---------------------------------------------------------------------
    // Users (2 procedures)
    // ---------------------------------------------------------------------

    /** List users with filters. */
    usersList: adminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.enum(VALID_STATUSES).optional(),
          role: z.enum(VALID_ROLES).optional(),
          hasCredits: z.boolean().optional(),
          lowBalance: z.boolean().optional(),
          sortBy: z.enum(VALID_SORT_BY).optional(),
          sortOrder: z.enum(VALID_SORT_ORDER).optional(),
          limit: z.number().int().positive().max(1000).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(({ input }) => {
        return d.getUserStore().list(input);
      }),

    /** Get a specific user by ID. */
    usersGet: adminProcedure.input(z.object({ userId: z.string().min(1) })).query(async ({ input }) => {
      const user = await d.getUserStore().getById(input.userId);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return user;
    }),

    // ---------------------------------------------------------------------
    // Tenant Status (5 procedures)
    // ---------------------------------------------------------------------

    /** Get tenant account status. */
    tenantStatus: adminProcedure.input(z.object({ tenantId: tenantIdSchema })).query(async ({ input }) => {
      const row = await d.getTenantStatusStore().get(input.tenantId);
      return row ?? { tenantId: input.tenantId, status: "active" };
    }),

    /** Suspend a tenant account. */
    suspendTenant: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          reason: z.string().min(1).max(1000),
          notifyByEmail: z.boolean().optional().default(false),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const store = d.getTenantStatusStore();
        const adminUserId = ctx.user?.id ?? "unknown";

        const current = await store.getStatus(input.tenantId);
        if (current === "banned") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot suspend a banned account",
          });
        }
        if (current === "suspended") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Account is already suspended",
          });
        }

        await store.suspend(input.tenantId, input.reason, adminUserId);

        let suspendedInstances: string[] = [];
        if (d.suspendAllForTenant) {
          suspendedInstances = await d.suspendAllForTenant(input.tenantId);
        }

        d.getAuditLog().log({
          adminUser: adminUserId,
          action: "tenant.suspend",
          category: "account",
          targetTenant: input.tenantId,
          details: {
            reason: input.reason,
            previousStatus: current,
            notifyByEmail: input.notifyByEmail,
            suspendedInstances,
          },
        });

        if (input.notifyByEmail) {
          try {
            const service = d.getNotificationService?.();
            const email = d.lookupTenantEmail ? await d.lookupTenantEmail(input.tenantId) : null;
            if (service && email) {
              service.notifyAdminSuspended(input.tenantId, email, input.reason);
            }
          } catch (err) {
            logger.error("notification failed after suspendTenant — operation was committed", { err });
          }
        }

        return {
          tenantId: input.tenantId,
          status: "suspended" as const,
          reason: input.reason,
          suspendedInstances,
        };
      }),

    /** Reactivate a suspended tenant account. */
    reactivateTenant: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          notifyByEmail: z.boolean().optional().default(false),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const store = d.getTenantStatusStore();
        const adminUserId = ctx.user?.id ?? "unknown";

        const current = await store.getStatus(input.tenantId);
        if (current === "banned") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot reactivate a banned account",
          });
        }
        if (current === "active") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Account is already active",
          });
        }

        await store.reactivate(input.tenantId, adminUserId);

        d.getAuditLog().log({
          adminUser: adminUserId,
          action: "tenant.reactivate",
          category: "account",
          targetTenant: input.tenantId,
          details: {
            previousStatus: current,
            notifyByEmail: input.notifyByEmail,
          },
        });

        if (input.notifyByEmail) {
          try {
            const service = d.getNotificationService?.();
            const email = d.lookupTenantEmail ? await d.lookupTenantEmail(input.tenantId) : null;
            if (service && email) {
              service.notifyAdminReactivated(input.tenantId, email);
            }
          } catch (err) {
            logger.error("notification failed after reactivateTenant — operation was committed", { err });
          }
        }

        return {
          tenantId: input.tenantId,
          status: "active" as const,
        };
      }),

    /** Ban a tenant account permanently. Requires typed confirmation. */
    banTenant: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          reason: z.string().min(1).max(1000),
          tosReference: z.string().min(1).max(500),
          confirmName: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const store = d.getTenantStatusStore();
        const adminUserId = ctx.user?.id ?? "unknown";

        const expectedConfirmation = `BAN ${input.tenantId}`;
        if (input.confirmName !== expectedConfirmation) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Type "${expectedConfirmation}" to confirm the ban`,
          });
        }

        const current = await store.getStatus(input.tenantId);
        if (current === "banned") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Account is already banned",
          });
        }

        // Suspend all product instances
        let suspendedInstances: string[] = [];
        if (d.suspendAllForTenant) {
          suspendedInstances = await d.suspendAllForTenant(input.tenantId);
        }

        // Auto-refund remaining credits
        let refundedCents = 0;
        const balance = await d.getCreditLedger().balance(input.tenantId);
        if (balance.greaterThan(Credit.ZERO)) {
          await d.getCreditLedger().debit(input.tenantId, balance, "refund", {
            description: `Auto-refund on account ban: ${input.reason}`,
          });
          refundedCents = balance.toCentsRounded();
        }

        // Disable auto-topup
        let autoTopupDisabled = false;
        if (d.getAutoTopupSettingsRepo) {
          const topupRepo = d.getAutoTopupSettingsRepo();
          const settings = await topupRepo.getByTenant(input.tenantId);
          if (settings) {
            await topupRepo.upsert(input.tenantId, {
              usageEnabled: false,
              scheduleEnabled: false,
            });
            autoTopupDisabled = true;
          }
        }

        // Detach all payment methods
        let paymentMethodsDetached = 0;
        if (d.detachAllPaymentMethods) {
          paymentMethodsDetached = await d.detachAllPaymentMethods(input.tenantId);
        }

        // Ban the tenant
        await store.ban(input.tenantId, input.reason, adminUserId);

        d.getAuditLog().log({
          adminUser: adminUserId,
          action: "tenant.ban",
          category: "account",
          targetTenant: input.tenantId,
          details: {
            reason: input.reason,
            tosReference: input.tosReference,
            previousStatus: current,
            suspendedInstances,
            refundedCents,
            autoTopupDisabled,
            paymentMethodsDetached,
          },
        });

        return {
          tenantId: input.tenantId,
          status: "banned" as const,
          reason: input.reason,
          refundedCents,
          suspendedInstances,
          paymentMethodsDetached,
        };
      }),

    /** Get full tenant detail (god view). */
    tenantDetail: adminProcedure.input(z.object({ tenantId: tenantIdSchema })).query(async ({ input }) => {
      const user = await d.getUserStore().getById(input.tenantId);
      const balance = await d.getCreditLedger().balance(input.tenantId);
      const recentTransactions = await d.getCreditLedger().history(input.tenantId, { limit: 10 });
      const status = await d.getTenantStatusStore().get(input.tenantId);

      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const usageSummaries = d.getMeterAggregator
        ? d.getMeterAggregator().querySummaries(input.tenantId, {
            since: thirtyDaysAgo,
            limit: 1000,
          })
        : [];
      const usageTotal = d.getMeterAggregator
        ? d.getMeterAggregator().getTenantTotal(input.tenantId, thirtyDaysAgo)
        : { totalCost: 0, totalCharge: 0, eventCount: 0 };

      return {
        user: user ?? null,
        credits: {
          balance_credits: balance.toCents(),
          recent_transactions: recentTransactions,
        },
        status: status ?? { tenantId: input.tenantId, status: "active" },
        usage: { summaries: usageSummaries, total: usageTotal },
      };
    }),

    // ---------------------------------------------------------------------
    // Notifications (3 procedures)
    // ---------------------------------------------------------------------

    /** Send a specific notification template to a tenant. */
    notificationSend: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          template: z.string().min(1).max(100),
          data: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .mutation(({ input, ctx }) => {
        const queueStore = d.getNotificationQueueStore?.();
        if (!queueStore) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Notification queue not initialized",
          });
        }

        const id = queueStore.enqueue(input.tenantId, input.template, input.data ?? {});

        d.getAuditLog().log({
          adminUser: ctx.user?.id ?? "unknown",
          action: "notification.send",
          category: "support",
          targetTenant: input.tenantId,
          details: { template: input.template, notificationId: id },
        });

        return { notificationId: id };
      }),

    /** Send a custom email to a tenant. */
    notificationSendCustom: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          email: z.string().email(),
          subject: z.string().min(1).max(500),
          body: z.string().min(1).max(10000),
        }),
      )
      .mutation(({ input, ctx }) => {
        const service = d.getNotificationService?.();
        if (!service) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Notification service not initialized",
          });
        }

        service.sendCustomEmail(input.tenantId, input.email, input.subject, input.body);

        d.getAuditLog().log({
          adminUser: ctx.user?.id ?? "unknown",
          action: "notification.custom",
          category: "support",
          targetTenant: input.tenantId,
          details: { subject: input.subject },
        });

        return { success: true };
      }),

    /** List notifications sent to a tenant. */
    notificationLog: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          status: z.enum(["pending", "sent", "failed"]).optional(),
          limit: z.number().int().positive().max(250).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(({ input }) => {
        const queueStore = d.getNotificationQueueStore?.();
        if (!queueStore) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Notification queue not initialized",
          });
        }

        const { tenantId, ...opts } = input;
        return queueStore.listForTenant(tenantId, opts);
      }),

    // ---------------------------------------------------------------------
    // Billing Health (1 procedure)
    // ---------------------------------------------------------------------

    /** Billing health dashboard — aggregates all observability signals. */
    billingHealth: adminProcedure.query(async () => {
      const timestamp = Date.now();

      // Gateway metrics
      let gateway5m = {
        totalRequests: 0,
        totalErrors: 0,
        errorRate: 0,
        creditDeductionFailures: 0,
        byCapability: new Map<string, { requests: number; errors: number; errorRate: number }>(),
      };
      let gateway60m = {
        totalRequests: 0,
        totalErrors: 0,
        errorRate: 0,
      };
      if (d.getMetricsCollector) {
        try {
          const metrics = d.getMetricsCollector();
          const [w5, w60] = await Promise.all([metrics.getWindow(5), metrics.getWindow(60)]);
          gateway5m = w5;
          gateway60m = {
            totalRequests: w60.totalRequests,
            totalErrors: w60.totalErrors,
            errorRate: w60.errorRate,
          };
        } catch {
          // Metrics unavailable — non-critical
        }
      }

      // Alerts
      let alerts: Array<{ name: string; firing: boolean; message: string }> = [];
      if (d.getAlertChecker) {
        try {
          alerts = d.getAlertChecker().getStatus();
        } catch {
          // Alert checker unavailable — non-critical
        }
      }

      // System resources
      let system: SystemResourceSnapshot | null = null;
      if (d.getSystemResourceMonitor) {
        try {
          system = d.getSystemResourceMonitor().getSnapshot();
        } catch {
          // Resource monitor unavailable — non-critical
        }
      }

      // Payment health
      let paymentChecks: PaymentHealthStatus["checks"] | null = null;
      let paymentOverall: "healthy" | "degraded" | "outage" = "healthy";
      let paymentSeverity: PaymentHealthStatus["severity"] = null;
      let paymentReasons: string[] = [];

      if (d.probePaymentHealth) {
        try {
          const health = await d.probePaymentHealth();
          paymentChecks = health.checks;
          paymentOverall = health.overall;
          paymentSeverity = health.severity;
          paymentReasons = health.reasons;
        } catch {
          paymentOverall = "degraded";
          paymentReasons = ["Payment health probe failed"];
        }
      }

      // Active instances
      let activeInstances: number | null = null;
      if (d.queryActiveInstances) {
        try {
          activeInstances = await d.queryActiveInstances();
        } catch {
          // DB unavailable — non-critical
        }
      }

      // Active tenants
      let activeTenantCount: number | null = null;
      if (d.queryActiveTenantCount) {
        try {
          activeTenantCount = await d.queryActiveTenantCount();
        } catch {
          // non-critical
        }
      }

      return {
        timestamp,
        gateway: {
          last5m: {
            totalRequests: gateway5m.totalRequests,
            totalErrors: gateway5m.totalErrors,
            errorRate: gateway5m.errorRate,
            byCapability: Object.fromEntries(gateway5m.byCapability),
          },
          last60m: {
            totalRequests: gateway60m.totalRequests,
            totalErrors: gateway60m.totalErrors,
            errorRate: gateway60m.errorRate,
          },
        },
        payment: {
          overall: paymentOverall,
          severity: paymentSeverity,
          reasons: paymentReasons,
          checks: paymentChecks,
        },
        alerts,
        system: system
          ? {
              cpuLoad1m: system.cpuLoad1m,
              cpuCount: system.cpuCount,
              memoryUsedBytes: system.memoryUsedBytes,
              memoryTotalBytes: system.memoryTotalBytes,
              diskUsedBytes: system.diskUsedBytes,
              diskTotalBytes: system.diskTotalBytes,
            }
          : null,
        fleet: { activeInstances },
        business: { activeTenantCount },
      };
    }),

    // ---------------------------------------------------------------------
    // Compliance (5 procedures)
    // ---------------------------------------------------------------------

    /** List data export requests. */
    complianceExportRequests: adminProcedure
      .input(
        z.object({
          status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
          limit: z.number().int().min(1).max(100).default(25),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .query(async ({ input }) => {
        const store = d.getExportStore?.();
        if (!store) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Export store not initialized",
          });
        }
        return store.list({
          status: input.status,
          limit: input.limit,
          offset: input.offset,
        });
      }),

    /** Trigger data export for a tenant. */
    complianceTriggerExport: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          reason: z.string().min(1).max(1000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const store = d.getExportStore?.();
        if (!store) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Export store not initialized",
          });
        }
        const adminUserId = ctx.user?.id ?? "unknown";
        const request = await store.create(input.tenantId, adminUserId);
        void d.getAuditLog().log({
          action: "compliance.triggerExport",
          adminUser: adminUserId,
          category: "support",
          targetTenant: input.tenantId,
          details: { requestId: request.id, reason: input.reason },
        });
        return request;
      }),

    /** List deletion requests. */
    complianceDeletionRequests: adminProcedure
      .input(
        z.object({
          status: z.enum(["pending", "cancelled", "completed"]).optional(),
          limit: z.number().int().positive().max(100).default(50),
          offset: z.number().int().nonnegative().default(0),
        }),
      )
      .query(async ({ input }) => {
        const store = d.getAccountDeletionStore?.();
        if (!store) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Account deletion store not initialized",
          });
        }
        return store.list({
          status: input.status,
          limit: input.limit,
          offset: input.offset,
        });
      }),

    /** Trigger account deletion for a tenant. */
    complianceTriggerDeletion: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          reason: z.string().min(1).max(1000),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const store = d.getAccountDeletionStore?.();
        if (!store) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Account deletion store not initialized",
          });
        }
        const adminUser = ctx.user?.id ?? "unknown";
        const existingPending = await store.getPendingForTenant(input.tenantId);
        if (existingPending) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A deletion request is already pending for this tenant",
          });
        }
        const result = await store.create(input.tenantId, adminUser, input.reason);
        d.getAuditLog().log({
          adminUser,
          action: "compliance.trigger_deletion",
          category: "account",
          targetTenant: input.tenantId,
          details: { requestId: result.id, reason: input.reason },
          outcome: "success",
        });
        return result;
      }),

    /** Cancel a pending deletion request. */
    complianceCancelDeletion: adminProcedure
      .input(z.object({ requestId: z.string().min(1).max(128) }))
      .mutation(async ({ input, ctx }) => {
        const store = d.getAccountDeletionStore?.();
        if (!store) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Account deletion store not initialized",
          });
        }
        const existing = await store.getById(input.requestId);
        if (!existing || existing.status !== "pending") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Pending deletion request not found",
          });
        }
        const adminUser = ctx.user?.id ?? "unknown";
        await store.cancel(input.requestId, "Cancelled by admin");
        d.getAuditLog().log({
          adminUser,
          action: "compliance.cancel_deletion",
          category: "account",
          targetTenant: existing.tenantId,
          details: { requestId: input.requestId },
          outcome: "success",
        });
        return { success: true };
      }),

    // ---------------------------------------------------------------------
    // Notes (4 procedures)
    // ---------------------------------------------------------------------

    /** List notes for a tenant. */
    notesList: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          limit: z.number().int().positive().max(250).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(({ input }) => {
        const store = d.getNotesStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Notes store not initialized" });
        }
        return store.list(input);
      }),

    /** Create a note on a tenant. */
    notesCreate: adminProcedure
      .input(
        z.object({
          tenantId: tenantIdSchema,
          content: z.string().min(1).max(10000),
          isPinned: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const store = d.getNotesStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Notes store not initialized" });
        }
        const note = await store.create({
          tenantId: input.tenantId,
          authorId: ctx.user?.id ?? "unknown",
          content: input.content,
          isPinned: input.isPinned,
        });
        void d.getAuditLog().log({
          adminUser: ctx.user?.id ?? "unknown",
          action: "note.create",
          category: "support",
          targetTenant: input.tenantId,
          details: { noteId: note.id },
        });
        return note;
      }),

    /** Update a note. */
    notesUpdate: adminProcedure
      .input(
        z.object({
          noteId: z.string().min(1),
          tenantId: tenantIdSchema,
          content: z.string().min(1).max(10000).optional(),
          isPinned: z.boolean().optional(),
        }),
      )
      .mutation(({ input, ctx }) => {
        const store = d.getNotesStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Notes store not initialized" });
        }
        const adminUser = ctx.user?.id ?? "unknown";
        const { noteId, tenantId, ...updates } = input;
        try {
          const note = store.update(noteId, tenantId, updates);
          if (!note) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
          }
          d.getAuditLog().log({
            adminUser,
            action: "note.update",
            category: "support",
            targetTenant: tenantId,
            details: { noteId, hasContentChange: !!updates.content, hasPinChange: updates.isPinned !== undefined },
            outcome: "success",
          });
          return note;
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "note.update",
            category: "support",
            targetTenant: tenantId,
            details: { noteId, error: String(err) },
            outcome: "failure",
          });
          throw err;
        }
      }),

    /** Delete a note. */
    notesDelete: adminProcedure
      .input(z.object({ noteId: z.string().min(1), tenantId: tenantIdSchema }))
      .mutation(({ input, ctx }) => {
        const store = d.getNotesStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Notes store not initialized" });
        }
        const adminUser = ctx.user?.id ?? "unknown";
        try {
          const deleted = store.delete(input.noteId, input.tenantId);
          if (!deleted) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
          }
          d.getAuditLog().log({
            adminUser,
            action: "note.delete",
            category: "support",
            targetTenant: input.tenantId,
            details: { noteId: input.noteId },
            outcome: "success",
          });
          return { success: true };
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "note.delete",
            category: "support",
            targetTenant: input.tenantId,
            details: { noteId: input.noteId, error: String(err) },
            outcome: "failure",
          });
          throw err;
        }
      }),

    // ---------------------------------------------------------------------
    // Revenue Analytics (9 procedures)
    // ---------------------------------------------------------------------

    /** Revenue overview cards: credits sold, consumed, provider cost, margin. */
    analyticsRevenue: adminProcedure.input(dateRangeSchema.partial()).query(({ input }) => {
      const store = d.getAnalyticsStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
      }
      return store.getRevenueOverview(resolveRange(input));
    }),

    /** Credit float: total unspent credits across all tenants. */
    analyticsFloat: adminProcedure.query(() => {
      const store = d.getAnalyticsStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
      }
      return store.getFloat();
    }),

    /** Revenue breakdown by category and capability. */
    analyticsRevenueBreakdown: adminProcedure.input(dateRangeSchema.partial()).query(({ input }) => {
      const store = d.getAnalyticsStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
      }
      return { breakdown: store.getRevenueBreakdown(resolveRange(input)) };
    }),

    /** Margin by capability: revenue, cost, margin for each capability. */
    analyticsMarginByCapability: adminProcedure.input(dateRangeSchema.partial()).query(({ input }) => {
      const store = d.getAnalyticsStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
      }
      return { margins: store.getMarginByCapability(resolveRange(input)) };
    }),

    /** Provider spend breakdown. */
    analyticsProviderSpend: adminProcedure.input(dateRangeSchema.partial()).query(({ input }) => {
      const store = d.getAnalyticsStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
      }
      return { providers: store.getProviderSpend(resolveRange(input)) };
    }),

    /** Tenant health summary. */
    analyticsTenantHealth: adminProcedure.query(() => {
      const store = d.getAnalyticsStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
      }
      return store.getTenantHealth();
    }),

    /** Auto-topup metrics: event counts, revenue, failure rate. */
    analyticsAutoTopup: adminProcedure.input(dateRangeSchema.partial()).query(({ input }) => {
      const store = d.getAnalyticsStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
      }
      return store.getAutoTopupMetrics(resolveRange(input));
    }),

    /** Time series data for charts. */
    analyticsTimeSeries: adminProcedure
      .input(
        z.object({
          from: z.number().int().positive().optional(),
          to: z.number().int().positive().optional(),
          bucketMs: z.number().int().positive().optional(),
        }),
      )
      .query(({ input }) => {
        const store = d.getAnalyticsStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
        }
        const range = resolveRange(input);
        const bucketMs = input.bucketMs ?? 86_400_000; // default 1 day
        return { series: store.getTimeSeries(range, bucketMs) };
      }),

    /** Export analytics data as CSV. */
    analyticsExport: adminProcedure
      .input(
        z.object({
          from: z.number().int().positive().optional(),
          to: z.number().int().positive().optional(),
          section: z.enum(VALID_CSV_SECTIONS),
        }),
      )
      .query(({ input }) => {
        const store = d.getAnalyticsStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Analytics not initialized" });
        }
        return { csv: store.exportCsv(resolveRange(input), input.section) };
      }),

    // ---------------------------------------------------------------------
    // Bulk Operations (7 procedures)
    // ---------------------------------------------------------------------

    /** Get all tenant IDs matching current filters (for "select all matching"). */
    bulkSelectAll: adminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          status: z.enum(VALID_STATUSES).optional(),
          role: z.enum(VALID_ROLES).optional(),
          hasCredits: z.boolean().optional(),
          lowBalance: z.boolean().optional(),
        }),
      )
      .query(async ({ input }) => {
        const store = d.getBulkStore?.();
        if (!store) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bulk store not initialized" });
        return { tenantIds: await store.listMatchingTenantIds(input) };
      }),

    /** Dry-run: preview which tenants would be affected. */
    bulkDryRun: adminProcedure
      .input(z.object({ tenantIds: z.array(tenantIdSchema).min(1).max(500) }))
      .query(async ({ input }) => {
        const store = d.getBulkStore?.();
        if (!store) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bulk store not initialized" });
        return { tenants: await store.dryRun(input.tenantIds) };
      }),

    /** Mass grant credits. */
    bulkGrant: adminProcedure
      .input(
        z.object({
          tenantIds: z.array(tenantIdSchema).min(1).max(500),
          amountCents: z.number().int().positive().max(100_000_00),
          reason: z.string().min(1).max(1000),
          notifyByEmail: z.boolean().default(false),
        }),
      )
      .mutation(({ input, ctx }) => {
        const store = d.getBulkStore?.();
        if (!store) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bulk store not initialized" });
        return store.bulkGrant(input, ctx.user?.id ?? "unknown");
      }),

    /** Undo a mass grant within 5 minutes. */
    bulkGrantUndo: adminProcedure.input(z.object({ operationId: z.string().uuid() })).mutation(({ input, ctx }) => {
      const store = d.getBulkStore?.();
      if (!store) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bulk store not initialized" });
      return store.undoGrant(input.operationId, ctx.user?.id ?? "unknown");
    }),

    /** Mass suspend tenants. */
    bulkSuspend: adminProcedure
      .input(
        z.object({
          tenantIds: z.array(tenantIdSchema).min(1).max(500),
          reason: z.string().min(1).max(1000),
          notifyByEmail: z.boolean().default(false),
        }),
      )
      .mutation(({ input, ctx }) => {
        const store = d.getBulkStore?.();
        if (!store) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bulk store not initialized" });
        return store.bulkSuspend(input, ctx.user?.id ?? "unknown");
      }),

    /** Mass reactivate tenants. */
    bulkReactivate: adminProcedure
      .input(z.object({ tenantIds: z.array(tenantIdSchema).min(1).max(500) }))
      .mutation(({ input, ctx }) => {
        const store = d.getBulkStore?.();
        if (!store) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bulk store not initialized" });
        return store.bulkReactivate(input, ctx.user?.id ?? "unknown");
      }),

    /** Mass export to CSV. */
    bulkExport: adminProcedure
      .input(
        z.object({
          tenantIds: z.array(tenantIdSchema).min(1).max(500),
          fields: z.array(
            z.object({
              key: z.enum([
                "account_info",
                "credit_balance",
                "monthly_products",
                "lifetime_spend",
                "last_seen",
                "transaction_history",
              ]),
              enabled: z.boolean(),
            }),
          ),
        }),
      )
      .mutation(({ input, ctx }) => {
        const store = d.getBulkStore?.();
        if (!store) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Bulk store not initialized" });
        return store.bulkExport(input, ctx.user?.id ?? "unknown");
      }),

    // ---------------------------------------------------------------------
    // Rates (9 procedures)
    // ---------------------------------------------------------------------

    /** List sell rates with optional filters. */
    ratesListSell: adminProcedure
      .input(
        z.object({
          capability: z.string().optional(),
          isActive: z.boolean().optional(),
          limit: z.number().int().positive().max(250).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(({ input }) => {
        const store = d.getRateStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
        }
        return store.listSellRates(input);
      }),

    /** Create a sell rate. */
    ratesCreateSell: adminProcedure
      .input(
        z.object({
          capability: z.string().min(1),
          displayName: z.string().min(1).max(200),
          unit: z.string().min(1).max(100),
          priceUsd: z.number().positive(),
          model: z.string().max(200).optional(),
          isActive: z.boolean().optional(),
          sortOrder: z.number().int().min(0).optional(),
        }),
      )
      .mutation(({ input, ctx }) => {
        const store = d.getRateStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
        }
        const adminUser = ctx.user?.id ?? "unknown";
        try {
          const result = store.createSellRate(input);
          d.getAuditLog().log({
            adminUser,
            action: "rates.sell.create",
            category: "config",
            details: { ...input },
            outcome: "success",
          });
          return result;
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "rates.sell.create",
            category: "config",
            details: { ...input, error: String(err) },
            outcome: "failure",
          });
          throw err;
        }
      }),

    /** Update a sell rate. */
    ratesUpdateSell: adminProcedure
      .input(
        z.object({
          id: z.string().min(1),
          capability: z.string().min(1).optional(),
          displayName: z.string().min(1).max(200).optional(),
          unit: z.string().min(1).max(100).optional(),
          priceUsd: z.number().positive().optional(),
          model: z.string().max(200).optional(),
          isActive: z.boolean().optional(),
          sortOrder: z.number().int().min(0).optional(),
        }),
      )
      .mutation(({ input, ctx }) => {
        const store = d.getRateStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
        }
        const adminUser = ctx.user?.id ?? "unknown";
        const { id, ...updates } = input;
        try {
          const result = store.updateSellRate(id, updates);
          d.getAuditLog().log({
            adminUser,
            action: "rates.sell.update",
            category: "config",
            details: { id, ...updates },
            outcome: "success",
          });
          return result;
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "rates.sell.update",
            category: "config",
            details: { id, ...updates, error: String(err) },
            outcome: "failure",
          });
          throw err;
        }
      }),

    /** Delete a sell rate. */
    ratesDeleteSell: adminProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input, ctx }) => {
      const store = d.getRateStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
      }
      const adminUser = ctx.user?.id ?? "unknown";
      try {
        const deleted = store.deleteSellRate(input.id);
        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Sell rate not found" });
        }
        d.getAuditLog().log({
          adminUser,
          action: "rates.sell.delete",
          category: "config",
          details: { id: input.id },
          outcome: "success",
        });
        return { success: true };
      } catch (err) {
        d.getAuditLog().log({
          adminUser,
          action: "rates.sell.delete",
          category: "config",
          details: { id: input.id, error: String(err) },
          outcome: "failure",
        });
        throw err;
      }
    }),

    /** List provider costs with optional filters. */
    ratesListProvider: adminProcedure
      .input(
        z.object({
          capability: z.string().optional(),
          adapter: z.string().optional(),
          isActive: z.boolean().optional(),
          limit: z.number().int().positive().max(250).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(({ input }) => {
        const store = d.getRateStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
        }
        return store.listProviderCosts(input);
      }),

    /** Create a provider cost. */
    ratesCreateProvider: adminProcedure
      .input(
        z.object({
          capability: z.string().min(1),
          adapter: z.string().min(1).max(100),
          model: z.string().max(200).optional(),
          unit: z.string().min(1).max(100),
          costUsd: z.number().positive(),
          priority: z.number().int().min(0).optional(),
          latencyClass: z.enum(["fast", "standard", "batch"]).optional(),
          isActive: z.boolean().optional(),
        }),
      )
      .mutation(({ input, ctx }) => {
        const store = d.getRateStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
        }
        const adminUser = ctx.user?.id ?? "unknown";
        try {
          const result = store.createProviderCost(input);
          d.getAuditLog().log({
            adminUser,
            action: "rates.provider.create",
            category: "config",
            details: { ...input },
            outcome: "success",
          });
          return result;
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "rates.provider.create",
            category: "config",
            details: { ...input, error: String(err) },
            outcome: "failure",
          });
          throw err;
        }
      }),

    /** Update a provider cost. */
    ratesUpdateProvider: adminProcedure
      .input(
        z.object({
          id: z.string().min(1),
          capability: z.string().min(1).optional(),
          adapter: z.string().min(1).max(100).optional(),
          model: z.string().max(200).optional(),
          unit: z.string().min(1).max(100).optional(),
          costUsd: z.number().positive().optional(),
          priority: z.number().int().min(0).optional(),
          latencyClass: z.enum(["fast", "standard", "batch"]).optional(),
          isActive: z.boolean().optional(),
        }),
      )
      .mutation(({ input, ctx }) => {
        const store = d.getRateStore?.();
        if (!store) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
        }
        const adminUser = ctx.user?.id ?? "unknown";
        const { id, ...updates } = input;
        try {
          const result = store.updateProviderCost(id, updates);
          d.getAuditLog().log({
            adminUser,
            action: "rates.provider.update",
            category: "config",
            details: { id, ...updates },
            outcome: "success",
          });
          return result;
        } catch (err) {
          d.getAuditLog().log({
            adminUser,
            action: "rates.provider.update",
            category: "config",
            details: { id, ...updates, error: String(err) },
            outcome: "failure",
          });
          throw err;
        }
      }),

    /** Delete a provider cost. */
    ratesDeleteProvider: adminProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input, ctx }) => {
      const store = d.getRateStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
      }
      const adminUser = ctx.user?.id ?? "unknown";
      try {
        const deleted = store.deleteProviderCost(input.id);
        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Provider cost not found" });
        }
        d.getAuditLog().log({
          adminUser,
          action: "rates.provider.delete",
          category: "config",
          details: { id: input.id },
          outcome: "success",
        });
        return { success: true };
      } catch (err) {
        d.getAuditLog().log({
          adminUser,
          action: "rates.provider.delete",
          category: "config",
          details: { id: input.id, error: String(err) },
          outcome: "failure",
        });
        throw err;
      }
    }),

    /** Get margin report. */
    ratesMargins: adminProcedure.input(z.object({ capability: z.string().optional() })).query(({ input }) => {
      const store = d.getRateStore?.();
      if (!store) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rate store not initialized" });
      }
      return { margins: store.getMarginReport(input.capability) };
    }),
  });
}
