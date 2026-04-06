/**
 * tRPC billing router — credits balance, history, checkout, spending limits,
 * auto-topup, dividends, affiliates, coupons.
 *
 * Pure platform-core — all product-specific behavior injected via deps.
 */

import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import type { AuditLogger } from "../../audit/logger.js";
import type { ICryptoChargeRepository, IPaymentProcessor } from "../../billing/index.js";
import { type CryptoServiceClient, createUnifiedCheckout, MIN_PAYMENT_USD } from "../../billing/index.js";
import { logger } from "../../config/logger.js";
import {
  ALLOWED_SCHEDULE_INTERVALS,
  ALLOWED_THRESHOLDS,
  ALLOWED_TOPUP_AMOUNTS,
  Credit,
  computeNextScheduleAt,
  type IAutoTopupSettingsRepository,
} from "../../credits/index.js";
import type { ILedger } from "../../credits/ledger.js";
import type { IMeterAggregator } from "../../metering/index.js";
import type { IAffiliateRepository } from "../../monetization/affiliate/drizzle-affiliate-repository.js";
import type { IDividendRepository } from "../../monetization/credits/dividend-repository.js";
import type { ISpendingLimitsRepository } from "../../monetization/drizzle-spending-limits-repository.js";
import { type CreditPriceMap, type ITenantCustomerRepository, loadCreditPriceMap } from "../../monetization/index.js";
import type { PromotionEngine } from "../../monetization/promotions/engine.js";
import type { ProductConfigService } from "../../product-config/service.js";
import { assertSafeRedirectUrl } from "../../security/index.js";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  type TRPCContext,
  tenantProcedure,
} from "../init.js";

// Narrowed context after tenantProcedure middleware (user + tenantId non-optional)
type TenantCtx = { user: NonNullable<TRPCContext["user"]>; tenantId: string; productSlug?: string };

import { z } from "zod";

// ---------------------------------------------------------------------------
// Schedule interval → hours mapping
// ---------------------------------------------------------------------------

const SCHEDULE_INTERVAL_HOURS: Record<"daily" | "weekly" | "monthly", number> = {
  daily: 24,
  weekly: 168,
  monthly: 720,
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const tenantIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const urlSchema = z.string().url().max(2048);
const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9_-]+$/i);

// ---------------------------------------------------------------------------
// Static plan data — credit-based tiers
// ---------------------------------------------------------------------------

const PLAN_TIERS = [
  {
    id: "free",
    tier: "free" as const,
    name: "Free",
    price: 0,
    priceLabel: "$0/mo",
    features: {
      instanceCap: 1,
      channels: "1 channel",
      plugins: "Community",
      support: "Community",
      extras: [] as string[],
    },
    recommended: false,
  },
  {
    id: "starter",
    tier: "starter" as const,
    name: "Starter",
    price: 5,
    priceLabel: "$5/mo per bot",
    features: {
      instanceCap: 3,
      channels: "Unlimited",
      plugins: "All plugins",
      support: "Email",
      extras: ["Usage-based credits"],
    },
    recommended: true,
  },
  {
    id: "pro",
    tier: "pro" as const,
    name: "Pro",
    price: 19,
    priceLabel: "$19/mo",
    features: {
      instanceCap: 10,
      channels: "Unlimited",
      plugins: "All plugins",
      support: "Priority",
      extras: ["Team management", "Priority queue"],
    },
    recommended: false,
  },
  {
    id: "enterprise",
    tier: "enterprise" as const,
    name: "Enterprise",
    price: null as number | null,
    priceLabel: "Custom",
    features: {
      instanceCap: null as number | null,
      channels: "Unlimited",
      plugins: "All + custom",
      support: "Dedicated",
      extras: ["SLA", "Custom integrations", "On-prem option"],
    },
    recommended: false,
  },
] as const;

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface BillingRouterDeps {
  processor: IPaymentProcessor;
  tenantRepo: ITenantCustomerRepository;
  creditLedger: ILedger;
  meterAggregator: IMeterAggregator;
  priceMap: CreditPriceMap | undefined;
  autoTopupSettingsStore: IAutoTopupSettingsRepository;
  dividendRepo: IDividendRepository;
  spendingLimitsRepo: ISpendingLimitsRepository;
  affiliateRepo: IAffiliateRepository;
  cryptoClient?: CryptoServiceClient;
  cryptoChargeRepo?: ICryptoChargeRepository;
  auditLogger?: AuditLogger;
  promotionEngine?: PromotionEngine;
  productConfig?: { product: { domain?: string } };
  productConfigService?: ProductConfigService;
  /** Raw DB for aggregation queries. */
  db?: import("../../db/index.js").DrizzleDb;
  /** Assert caller is admin/owner of the tenant. Skips check for personal tenants (tenantId === userId). */
  assertOrgAdminOrOwner: (tenantId: string, userId: string, roles?: string[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory — DI-based
// ---------------------------------------------------------------------------

export function createBillingRouter(d: BillingRouterDeps) {
  return router({
    creditsBalance: tenantProcedure
      .input(z.object({ tenant: tenantIdSchema.optional() }).optional())
      .query(async ({ input, ctx }: { input: { tenant?: string } | undefined; ctx: TenantCtx }) => {
        if (input?.tenant && input.tenant !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const tenant = input?.tenant ?? ctx.tenantId;
        const balance = await d.creditLedger.balance(tenant);
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const { totalCharge } = await d.meterAggregator.getTenantTotal(tenant, sevenDaysAgo);
        const daily_burn_cents = Credit.fromRaw(Math.round(totalCharge / 7)).toCentsRounded();
        const runway_days = daily_burn_cents > 0 ? Math.floor(balance.toCentsRounded() / daily_burn_cents) : null;
        return { tenant, balance_cents: balance.toCentsRounded(), daily_burn_cents, runway_days };
      }),

    creditsHistory: tenantProcedure
      .input(
        z.object({
          tenant: tenantIdSchema.optional(),
          type: z.enum(["grant", "refund", "correction"]).optional(),
          from: z.number().int().optional(),
          to: z.number().int().optional(),
          limit: z.number().int().positive().max(1000).optional(),
          offset: z.number().int().min(0).optional(),
        }),
      )
      .query(
        async ({
          input,
          ctx,
        }: {
          input: { tenant?: string; type?: string; from?: number; to?: number; limit?: number; offset?: number };
          ctx: TenantCtx;
        }) => {
          if (input.tenant && input.tenant !== ctx.tenantId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
          const tenant = input.tenant ?? ctx.tenantId;
          const entries = await d.creditLedger.history(tenant, input);
          return { entries, total: entries.length };
        },
      ),

    /**
     * Daily-aggregated transaction history.
     * Usage entries (adapter_usage) are GROUP BY day with SUM.
     * Individual entries (purchase, refund, etc.) are returned as-is.
     * All amounts come from the double-entry ledger via JOIN on journal_lines.
     */
    creditsDailySummary: tenantProcedure
      .input(
        z
          .object({ tenant: tenantIdSchema.optional(), limit: z.number().int().positive().max(100).optional() })
          .optional(),
      )
      .query(async ({ input, ctx }: { input: { tenant?: string; limit?: number } | undefined; ctx: TenantCtx }) => {
        if (!d.db) return { rows: [] };
        const tenant = input?.tenant ?? ctx.tenantId;
        const limit = input?.limit ?? 50;
        const tenantAccountCode = `2000:${tenant}`;

        const result = await d.db.execute(sql`
          WITH tenant_acct AS (
            SELECT id FROM accounts WHERE code = ${tenantAccountCode} LIMIT 1
          ),
          -- Individual entries (not aggregated)
          individual AS (
            SELECT
              je.id,
              je.entry_type,
              je.description,
              je.posted_at,
              CASE WHEN jl.side = 'credit' THEN jl.amount ELSE -jl.amount END AS signed_amount,
              1 AS entry_count
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.tenant_id = ${tenant}
              AND jl.account_id = (SELECT id FROM tenant_acct)
              AND je.entry_type NOT IN ('adapter_usage')
          ),
          -- Aggregated usage by day
          aggregated AS (
            SELECT
              MIN(je.id) AS id,
              je.entry_type,
              'LLM Inference' AS description,
              SUBSTRING(je.posted_at, 1, 10) AS posted_at,
              SUM(CASE WHEN jl.side = 'credit' THEN jl.amount ELSE -jl.amount END) AS signed_amount,
              COUNT(*)::int AS entry_count
            FROM journal_entries je
            JOIN journal_lines jl ON jl.journal_entry_id = je.id
            WHERE je.tenant_id = ${tenant}
              AND jl.account_id = (SELECT id FROM tenant_acct)
              AND je.entry_type IN ('adapter_usage')
            GROUP BY SUBSTRING(je.posted_at, 1, 10), je.entry_type
          )
          SELECT * FROM individual
          UNION ALL
          SELECT * FROM aggregated
          ORDER BY posted_at DESC
          LIMIT ${limit}
        `);

        const typed = result as { rows: Array<Record<string, unknown>> };
        return {
          rows: (
            typed.rows as Array<{
              id: string;
              entry_type: string;
              description: string;
              posted_at: string;
              signed_amount: string | number;
              entry_count: string | number;
            }>
          ).map((r) => ({
            id: r.id,
            entryType: r.entry_type,
            description: r.description,
            postedAt: r.posted_at,
            signedAmountNano: Number(r.signed_amount),
            entryCount: Number(r.entry_count),
          })),
        };
      }),

    creditOptions: protectedProcedure.query(async ({ ctx }) => {
      // Resolve price map per-product from DB, falling back to boot-time singleton
      let priceMap = d.priceMap;
      if (d.productConfigService && ctx.productSlug) {
        const pc = await d.productConfigService.getBySlug(ctx.productSlug);
        if (pc?.billing?.creditPrices && Object.keys(pc.billing.creditPrices).length > 0) {
          priceMap = loadCreditPriceMap(pc.billing.creditPrices as Record<string, unknown>);
        }
      }
      if (!priceMap || priceMap.size === 0) return [];
      const options: Array<{
        priceId: string;
        label: string;
        amountCents: number;
        creditCents: number;
        bonusPercent: number;
      }> = [];
      for (const [priceId, point] of priceMap) {
        options.push({
          priceId,
          label: point.label,
          amountCents: point.amountCents,
          creditCents: point.creditCents,
          bonusPercent: point.bonusPercent,
        });
      }
      options.sort((a, b) => a.amountCents - b.amountCents);
      return options;
    }),

    creditsCheckout: tenantProcedure
      .input(
        z.object({
          tenant: tenantIdSchema.optional(),
          priceId: z.string().min(1).max(256),
          successUrl: urlSchema,
          cancelUrl: urlSchema,
        }),
      )
      .mutation(
        async ({
          input,
          ctx,
        }: {
          input: { tenant?: string; priceId: string; successUrl: string; cancelUrl: string };
          ctx: TenantCtx;
        }) => {
          const tenant = input.tenant ?? ctx.tenantId;
          if (input.tenant && input.tenant !== ctx.tenantId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
          // No org admin check — any authenticated tenant user can buy credits
          try {
            assertSafeRedirectUrl(input.successUrl);
            assertSafeRedirectUrl(input.cancelUrl);
          } catch {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid redirect URL" });
          }
          // Resolve per-product Stripe key from DB for checkout
          let processor = d.processor;
          if (d.productConfigService && ctx.productSlug) {
            const pc = await d.productConfigService.getBySlug(ctx.productSlug);
            const productStripeKey = pc?.billing?.stripeSecretKey;
            if (productStripeKey && pc?.billing) {
              const StripeModule = await import("stripe");
              const stripeClient = new StripeModule.default(productStripeKey);
              const { StripePaymentProcessor } = await import("../../billing/stripe/stripe-payment-processor.js");
              const priceMap = loadCreditPriceMap(pc.billing.creditPrices as Record<string, unknown>);
              processor = new StripePaymentProcessor({
                stripe: stripeClient,
                tenantRepo: d.tenantRepo,
                webhookSecret: pc.billing.stripeWebhookSecret ?? "",
                priceMap,
                creditLedger: d.creditLedger,
              });
            }
          }
          const session = await processor.createCheckoutSession({
            tenant,
            priceId: input.priceId,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
          });
          return { url: session.url, sessionId: session.id };
        },
      ),

    supportedPaymentMethods: publicProcedure.query(async () => {
      if (!d.cryptoClient) return [];
      try {
        return await d.cryptoClient.listChains();
      } catch {
        return [];
      }
    }),

    checkout: tenantProcedure
      .input(
        z.object({
          methodId: z.string().min(1).max(64),
          amountUsd: z.number().min(MIN_PAYMENT_USD).max(10000),
        }),
      )
      .mutation(async ({ input, ctx }: { input: { methodId: string; amountUsd: number }; ctx: TenantCtx }) => {
        const tenant = ctx.tenantId;
        // No org admin check — any authenticated tenant user can buy credits
        if (!d.cryptoClient) {
          throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Crypto payments not configured" });
        }
        const domain = d.productConfig?.product?.domain ?? "localhost";
        const callbackUrl = `https://api.${domain}/api/webhooks/crypto`;
        try {
          const result = await createUnifiedCheckout({ cryptoService: d.cryptoClient }, input.methodId, {
            tenant,
            amountUsd: input.amountUsd,
            callbackUrl,
          });
          if (d.cryptoChargeRepo) {
            await d.cryptoChargeRepo.create(result.referenceId, tenant, Math.round(input.amountUsd * 100));
          }
          return result;
        } catch (err) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Crypto checkout failed",
          });
        }
      }),

    chargeStatus: tenantProcedure
      .input(z.object({ referenceId: z.string().min(1) }))
      .query(async ({ input, ctx }: { input: { referenceId: string }; ctx: TenantCtx }) => {
        if (!d.cryptoChargeRepo) {
          throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Crypto payments not configured" });
        }
        const charge = await d.cryptoChargeRepo.get(input.referenceId);
        if (!charge || charge.tenantId !== ctx.tenantId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Charge not found" });
        }
        return {
          chargeId: charge.id,
          status: charge.status,
          credited: charge.credited,
          amountExpectedCents: charge.amountExpectedCents,
          amountReceivedCents: charge.amountReceivedCents,
          expectedAmount: charge.expectedAmount,
          receivedAmount: charge.receivedAmount,
          token: charge.token,
          decimals: charge.decimals,
          confirmations: charge.confirmations,
          confirmationsRequired: charge.confirmationsRequired,
          txHash: charge.txHash,
        };
      }),

    adminListPaymentMethods: adminProcedure.query(async () => {
      if (!d.cryptoClient) return [];
      try {
        return await d.cryptoClient.listChains();
      } catch {
        return [];
      }
    }),

    adminUpsertPaymentMethod: adminProcedure
      .input(
        z.object({
          id: z.string().min(1).max(64),
          type: z.string().min(1),
          token: z.string().min(1),
          chain: z.string().min(1),
          contractAddress: z.string().nullable(),
          decimals: z.number().int().min(0).max(18),
          displayName: z.string().min(1),
          enabled: z.boolean(),
          displayOrder: z.number().int().min(0),
          rpcUrl: z.string().nullable(),
          oracleAddress: z.string().min(1).nullable().optional(),
          xpub: z.string().min(1).nullable().optional(),
          confirmations: z.number().int().min(1),
          addressType: z.string().min(1).optional(),
        }),
      )
      .mutation(async () => {
        throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Payment methods are managed by the chain server" });
      }),

    adminTogglePaymentMethod: adminProcedure
      .input(z.object({ id: z.string().min(1), enabled: z.boolean() }))
      .mutation(async () => {
        throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Payment methods are managed by the chain server" });
      }),

    portalSession: tenantProcedure
      .input(z.object({ tenant: tenantIdSchema.optional(), returnUrl: urlSchema }))
      .mutation(async ({ input, ctx }: { input: { tenant?: string; returnUrl: string }; ctx: TenantCtx }) => {
        const tenant = input.tenant ?? ctx.tenantId;
        if (input.tenant && input.tenant !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        await d.assertOrgAdminOrOwner(tenant, ctx.user.id);
        try {
          assertSafeRedirectUrl(input.returnUrl);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid redirect URL" });
        }
        if (!d.processor.supportsPortal()) {
          return { url: null };
        }
        const session = await d.processor.createPortalSession({ tenant, returnUrl: input.returnUrl });
        return { url: session.url };
      }),

    usage: tenantProcedure
      .input(
        z.object({
          tenant: tenantIdSchema.optional(),
          capability: identifierSchema.optional(),
          provider: identifierSchema.optional(),
          startDate: z.number().int().positive().optional(),
          endDate: z.number().int().positive().optional(),
          limit: z.number().int().positive().max(1000).optional(),
        }),
      )
      .query(
        async ({
          input,
          ctx,
        }: {
          input: {
            tenant?: string;
            capability?: string;
            provider?: string;
            startDate?: number;
            endDate?: number;
            limit?: number;
          };
          ctx: TenantCtx;
        }) => {
          const tenant = input.tenant ?? ctx.tenantId;
          if (input.tenant && input.tenant !== ctx.tenantId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
          }
          let summaries = await d.meterAggregator.querySummaries(tenant, {
            since: input.startDate,
            until: input.endDate,
            limit: input.limit,
          });
          if (input.capability) {
            summaries = summaries.filter((s) => s.capability === input.capability);
          }
          if (input.provider) {
            summaries = summaries.filter((s) => s.provider === input.provider);
          }
          return { tenant, usage: summaries };
        },
      ),

    usageSummary: tenantProcedure
      .input(
        z.object({
          tenant: tenantIdSchema.optional(),
          startDate: z.number().int().positive().optional(),
        }),
      )
      .query(async ({ input, ctx }: { input: { tenant?: string; startDate?: number }; ctx: TenantCtx }) => {
        const tenant = input.tenant ?? ctx.tenantId;
        if (input.tenant && input.tenant !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
        }
        const since = input.startDate ?? Math.floor(Date.now() / 3_600_000) * 3_600_000;
        const total = await d.meterAggregator.getTenantTotal(tenant, since);
        return {
          tenant,
          period_start: since,
          total_cost: total.totalCost,
          total_charge: total.totalCharge,
          event_count: total.eventCount,
        };
      }),

    plans: protectedProcedure.query(() => {
      return [...PLAN_TIERS];
    }),

    currentPlan: tenantProcedure.query(async ({ ctx }: { ctx: TenantCtx }) => {
      const mapping = await d.tenantRepo.getByTenant(ctx.tenantId);
      return { tier: (mapping?.tier ?? "free") as "free" | "starter" | "pro" | "enterprise" };
    }),

    changePlan: tenantProcedure
      .input(z.object({ tier: z.enum(["free", "starter", "pro", "enterprise"]) }))
      .mutation(
        async ({ input, ctx }: { input: { tier: "free" | "starter" | "pro" | "enterprise" }; ctx: TenantCtx }) => {
          await d.assertOrgAdminOrOwner(ctx.tenantId, ctx.user.id);
          await d.tenantRepo.setTier(ctx.tenantId, input.tier);
          return { tier: input.tier };
        },
      ),

    inferenceMode: tenantProcedure.query(async ({ ctx }: { ctx: TenantCtx }) => {
      const mode = await d.tenantRepo.getInferenceMode(ctx.tenantId);
      return { mode: mode as "byok" | "hosted" };
    }),

    setInferenceMode: tenantProcedure
      .input(z.object({ mode: z.enum(["byok", "hosted"]) }))
      .mutation(async ({ input, ctx }: { input: { mode: "byok" | "hosted" }; ctx: TenantCtx }) => {
        await d.assertOrgAdminOrOwner(ctx.tenantId, ctx.user.id);
        await d.tenantRepo.setInferenceMode(ctx.tenantId, input.mode);
        return { mode: input.mode };
      }),

    providerCosts: tenantProcedure.query(() => {
      return [] as Array<{
        provider: string;
        estimatedCost: number;
        inputTokens: number;
        outputTokens: number;
      }>;
    }),

    hostedUsageSummary: tenantProcedure.query(async ({ ctx }: { ctx: TenantCtx }) => {
      const tenant = ctx.tenantId;
      const periodStart = new Date();
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);
      const since = periodStart.getTime();
      const summaries = await d.meterAggregator.querySummaries(tenant, { since, limit: 1000 });
      const capMap = new Map<string, { units: number; cost: number }>();
      for (const s of summaries) {
        const existing = capMap.get(s.capability) ?? { units: 0, cost: 0 };
        existing.units += s.event_count;
        existing.cost += s.total_charge;
        capMap.set(s.capability, existing);
      }
      const capabilities = Array.from(capMap.entries()).map(([capability, data]) => ({
        capability,
        label: capability.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        units: data.units,
        unitLabel: "events",
        cost: data.cost,
      }));
      const totalCost = capabilities.reduce((sum, c) => sum + c.cost, 0);
      const balance = await d.creditLedger.balance(tenant);
      return {
        periodStart: periodStart.toISOString(),
        periodEnd: new Date().toISOString(),
        capabilities,
        totalCost,
        includedCredit: balance.toCentsFloor(),
        amountDue: Math.max(0, totalCost - balance.toCentsFloor()),
      };
    }),

    hostedUsageEvents: tenantProcedure
      .input(
        z
          .object({
            capability: z.string().optional(),
            from: z.string().optional(),
            to: z.string().optional(),
          })
          .optional(),
      )
      .query(
        async ({
          input,
          ctx,
        }: {
          input: { capability?: string; from?: string; to?: string } | undefined;
          ctx: TenantCtx;
        }) => {
          const tenant = ctx.tenantId;
          const since = input?.from ? new Date(input.from).getTime() : undefined;
          const until = input?.to ? new Date(input.to).getTime() : undefined;
          let summaries = await d.meterAggregator.querySummaries(tenant, { since, until, limit: 500 });
          if (input?.capability) {
            summaries = summaries.filter((s) => s.capability === input.capability);
          }
          return summaries.map((s) => ({
            id: `${s.tenant}-${s.capability}-${s.window_start}`,
            date: new Date(s.window_start).toISOString(),
            capability: s.capability,
            provider: s.provider,
            units: s.event_count,
            unitLabel: "events",
            cost: s.total_charge,
          }));
        },
      ),

    spendingLimits: tenantProcedure.query(async ({ ctx }: { ctx: TenantCtx }) => {
      return await d.spendingLimitsRepo.get(ctx.tenantId);
    }),

    updateSpendingLimits: tenantProcedure
      .input(
        z.object({
          global: z.object({
            alertAt: z.number().nonnegative().nullable(),
            hardCap: z.number().nonnegative().nullable(),
          }),
          perCapability: z.record(
            z.string(),
            z.object({
              alertAt: z.number().nonnegative().nullable(),
              hardCap: z.number().nonnegative().nullable(),
            }),
          ),
        }),
      )
      .mutation(
        async ({
          input,
          ctx,
        }: {
          input: {
            global: { alertAt: number | null; hardCap: number | null };
            perCapability: Record<string, { alertAt: number | null; hardCap: number | null }>;
          };
          ctx: TenantCtx;
        }) => {
          await d.assertOrgAdminOrOwner(ctx.tenantId, ctx.user.id);
          await d.spendingLimitsRepo.upsert(ctx.tenantId, input);
          return await d.spendingLimitsRepo.get(ctx.tenantId);
        },
      ),

    billingInfo: tenantProcedure.query(async ({ ctx }: { ctx: TenantCtx }) => {
      try {
        const savedMethods = await d.processor.listPaymentMethods(ctx.tenantId);
        const paymentMethods = savedMethods.map((pm) => ({
          id: pm.id,
          brand: "",
          last4: pm.label.match(/\d{4}$/)?.[0] ?? "",
          expiryMonth: 0,
          expiryYear: 0,
          isDefault: pm.isDefault,
        }));
        const invoiceList = await d.processor.listInvoices(ctx.tenantId);
        return {
          email: await d.processor.getCustomerEmail(ctx.tenantId),
          paymentMethods,
          invoices: invoiceList.map((inv) => ({
            id: inv.id,
            date: inv.date,
            amountCents: inv.amountCents,
            status: inv.status,
            downloadUrl: inv.downloadUrl,
          })),
        };
      } catch {
        return { email: "", paymentMethods: [], invoices: [] };
      }
    }),

    updateBillingEmail: tenantProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }: { input: { email: string }; ctx: TenantCtx }) => {
        await d.assertOrgAdminOrOwner(ctx.tenantId, ctx.user.id);
        const mapping = await d.tenantRepo.getByTenant(ctx.tenantId);
        if (!mapping) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No billing account found" });
        }
        await d.processor.updateCustomerEmail(ctx.tenantId, input.email);
        return { email: input.email };
      }),

    removePaymentMethod: tenantProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ input, ctx }: { input: { id: string }; ctx: TenantCtx }) => {
        await d.assertOrgAdminOrOwner(ctx.tenantId, ctx.user.id);
        const { PaymentMethodOwnershipError } = await import("../../billing/index.js");
        const mapping = await d.tenantRepo.getByTenant(ctx.tenantId);
        if (mapping) {
          const paymentMethods = await d.processor.listPaymentMethods(ctx.tenantId);
          if (paymentMethods.length <= 1) {
            const hasBillingHold = mapping.billing_hold === 1;
            const hasOutstandingBalance = (await d.creditLedger.balance(ctx.tenantId)).isNegative();
            if (hasBillingHold || hasOutstandingBalance) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Cannot remove last payment method with active billing hold or outstanding balance",
              });
            }
          }
        }
        try {
          await d.processor.detachPaymentMethod(ctx.tenantId, input.id);
          return { removed: true };
        } catch (err) {
          if (err instanceof PaymentMethodOwnershipError) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Payment method does not belong to this account" });
          }
          logger.error("billing.removePaymentMethod failed", {
            error: String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to remove payment method. Please try again.",
          });
        }
      }),

    autoTopupSettings: tenantProcedure.query(async ({ ctx }: { ctx: TenantCtx }) => {
      const settings = await d.autoTopupSettingsStore.getByTenant(ctx.tenantId);
      let paymentMethodLast4: string | null = null;
      try {
        const methods = await d.processor.listPaymentMethods(ctx.tenantId);
        const first = methods[0];
        if (first) {
          paymentMethodLast4 = first.label.match(/\d{4}$/)?.[0] ?? null;
        }
      } catch {
        // Processor call failed — return null for last4
      }
      return {
        usage_enabled: settings?.usageEnabled ?? false,
        usage_threshold_cents: settings?.usageThreshold.toCents() ?? 500,
        usage_topup_cents: settings?.usageTopup.toCents() ?? 2000,
        schedule_enabled: settings?.scheduleEnabled ?? false,
        schedule_amount_cents: settings?.scheduleAmount?.toCents() ?? null,
        schedule_next_at: settings?.scheduleNextAt ?? null,
        schedule_interval_hours: settings?.scheduleIntervalHours ?? 168,
        payment_method_last4: paymentMethodLast4,
      };
    }),

    updateAutoTopupSettings: tenantProcedure
      .input(
        z.object({
          usage_enabled: z.boolean().optional(),
          usage_threshold_cents: z
            .number()
            .int()
            .refine((v: number) => (ALLOWED_THRESHOLDS as readonly number[]).includes(v), {
              message: `Must be one of: ${ALLOWED_THRESHOLDS.join(", ")}`,
            })
            .optional(),
          usage_topup_cents: z
            .number()
            .int()
            .refine((v: number) => (ALLOWED_TOPUP_AMOUNTS as readonly number[]).includes(v), {
              message: `Must be one of: ${ALLOWED_TOPUP_AMOUNTS.join(", ")}`,
            })
            .optional(),
          schedule_enabled: z.boolean().optional(),
          schedule_interval: z.enum(ALLOWED_SCHEDULE_INTERVALS).nullable().optional(),
          schedule_amount_cents: z
            .number()
            .int()
            .refine((v: number) => (ALLOWED_TOPUP_AMOUNTS as readonly number[]).includes(v), {
              message: `Must be one of: ${ALLOWED_TOPUP_AMOUNTS.join(", ")}`,
            })
            .nullable()
            .optional(),
        }),
      )
      .mutation(
        async ({
          input,
          ctx,
        }: {
          input: {
            usage_enabled?: boolean;
            usage_threshold_cents?: number;
            usage_topup_cents?: number;
            schedule_enabled?: boolean;
            schedule_interval?: "daily" | "weekly" | "monthly" | null;
            schedule_amount_cents?: number | null;
          };
          ctx: TenantCtx;
        }) => {
          await d.assertOrgAdminOrOwner(ctx.tenantId, ctx.user.id);
          const enablingUsage = input.usage_enabled === true;
          const enablingSchedule = input.schedule_enabled === true;
          if (enablingUsage || enablingSchedule) {
            const methods = await d.processor.listPaymentMethods(ctx.tenantId);
            if (methods.length === 0) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "No payment method on file. Please add a payment method first.",
              });
            }
          }
          const previous = await d.autoTopupSettingsStore.getByTenant(ctx.tenantId);
          let scheduleNextAt: string | null | undefined;
          if (input.schedule_enabled === true && input.schedule_interval) {
            scheduleNextAt = computeNextScheduleAt(input.schedule_interval);
          } else if (input.schedule_interval === null) {
            scheduleNextAt = null;
          } else if (input.schedule_enabled === false) {
            scheduleNextAt = null;
          }
          await d.autoTopupSettingsStore.upsert(ctx.tenantId, {
            usageEnabled: input.usage_enabled,
            usageThreshold:
              input.usage_threshold_cents != null ? Credit.fromCents(input.usage_threshold_cents) : undefined,
            usageTopup: input.usage_topup_cents != null ? Credit.fromCents(input.usage_topup_cents) : undefined,
            scheduleEnabled: input.schedule_enabled,
            scheduleAmount:
              input.schedule_amount_cents != null ? Credit.fromCents(input.schedule_amount_cents) : undefined,
            scheduleIntervalHours: input.schedule_interval
              ? SCHEDULE_INTERVAL_HOURS[input.schedule_interval]
              : undefined,
            scheduleNextAt: scheduleNextAt,
          });
          const updated = await d.autoTopupSettingsStore.getByTenant(ctx.tenantId);
          if (d.auditLogger) {
            try {
              const snapshotSettings = (s: typeof previous) =>
                s
                  ? {
                      usage_enabled: s.usageEnabled,
                      usage_threshold_cents: s.usageThreshold.toCents(),
                      usage_topup_cents: s.usageTopup.toCents(),
                      schedule_enabled: s.scheduleEnabled,
                      schedule_amount_cents: s.scheduleAmount.toCents(),
                      schedule_interval_hours: s.scheduleIntervalHours,
                      schedule_next_at: s.scheduleNextAt,
                    }
                  : null;
              await d.auditLogger.log({
                userId: ctx.user.id,
                authMethod: "session",
                action: "billing.auto_topup_update",
                resourceType: "billing",
                resourceId: ctx.tenantId,
                details: {
                  previous: snapshotSettings(previous),
                  new: snapshotSettings(updated),
                },
              });
            } catch {
              // Audit logging must never break billing operations
            }
          }
          return {
            usage_enabled: updated?.usageEnabled ?? false,
            usage_threshold_cents: updated?.usageThreshold.toCents() ?? 500,
            usage_topup_cents: updated?.usageTopup.toCents() ?? 2000,
            schedule_enabled: updated?.scheduleEnabled ?? false,
            schedule_amount_cents: updated?.scheduleAmount?.toCents() ?? null,
            schedule_next_at: updated?.scheduleNextAt ?? null,
            schedule_interval_hours: updated?.scheduleIntervalHours ?? 168,
            payment_method_last4: null,
          };
        },
      ),

    dividendStats: tenantProcedure
      .input(z.object({ tenant: tenantIdSchema.optional() }).optional())
      .query(async ({ input, ctx }: { input: { tenant?: string } | undefined; ctx: TenantCtx }) => {
        const tenant = input?.tenant ?? ctx.tenantId;
        if (input?.tenant && input.tenant !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const stats = await d.dividendRepo.getStats(tenant);
        return {
          pool_cents: stats.pool.toCents(),
          active_users: stats.activeUsers,
          per_user_cents: stats.perUser.toCents(),
          next_distribution_at: stats.nextDistributionAt,
          user_eligible: stats.userEligible,
          user_last_purchase_at: stats.userLastPurchaseAt,
          user_window_expires_at: stats.userWindowExpiresAt,
        };
      }),

    dividendHistory: tenantProcedure
      .input(
        z
          .object({
            tenant: tenantIdSchema.optional(),
            limit: z.number().int().positive().max(250).optional(),
            offset: z.number().int().min(0).optional(),
          })
          .optional(),
      )
      .query(
        async ({
          input,
          ctx,
        }: {
          input: { tenant?: string; limit?: number; offset?: number } | undefined;
          ctx: TenantCtx;
        }) => {
          const tenant = input?.tenant ?? ctx.tenantId;
          if (input?.tenant && input.tenant !== ctx.tenantId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
          const dividends = await d.dividendRepo.getHistory(tenant, input?.limit ?? 50, input?.offset ?? 0);
          return { dividends };
        },
      ),

    dividendLifetime: tenantProcedure
      .input(z.object({ tenant: tenantIdSchema.optional() }).optional())
      .query(async ({ input, ctx }: { input: { tenant?: string } | undefined; ctx: TenantCtx }) => {
        const tenant = input?.tenant ?? ctx.tenantId;
        if (input?.tenant && input.tenant !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const total = await d.dividendRepo.getLifetimeTotal(tenant);
        return { total_cents: total.toCents(), tenant };
      }),

    affiliateInfo: tenantProcedure.query(async ({ ctx }: { ctx: TenantCtx }) => {
      return await d.affiliateRepo.getStats(ctx.tenantId);
    }),

    affiliateRecordReferral: tenantProcedure
      .input(
        z.object({
          code: z
            .string()
            .min(1)
            .max(10)
            .regex(/^[a-z0-9]+$/),
          referredTenantId: tenantIdSchema,
        }),
      )
      .mutation(async ({ input, ctx }: { input: { code: string; referredTenantId: string }; ctx: TenantCtx }) => {
        if (input.referredTenantId !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot record referral for another tenant" });
        }
        const codeRecord = await d.affiliateRepo.getByCode(input.code);
        if (!codeRecord) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Invalid referral code" });
        }
        if (codeRecord.tenantId === input.referredTenantId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Self-referral is not allowed" });
        }
        const isNew = await d.affiliateRepo.recordReferral(codeRecord.tenantId, input.referredTenantId, input.code, {});
        return { recorded: isNew, referrer: codeRecord.tenantId };
      }),

    memberUsage: tenantProcedure
      .input(z.object({ tenant: tenantIdSchema.optional() }).optional())
      .query(async ({ input, ctx }: { input: { tenant?: string } | undefined; ctx: TenantCtx }) => {
        const tenant = input?.tenant ?? ctx.tenantId;
        if (input?.tenant && input.tenant !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const members = await d.creditLedger.memberUsage(tenant);
        return { tenant, members };
      }),

    applyCoupon: tenantProcedure
      .input(z.object({ code: z.string().min(1).max(50) }))
      .mutation(async ({ input, ctx }: { input: { code: string }; ctx: TenantCtx }) => {
        await d.assertOrgAdminOrOwner(ctx.tenantId, ctx.user.id);
        if (!d.promotionEngine) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Promotion engine not initialized" });
        }
        let results: Awaited<ReturnType<typeof d.promotionEngine.evaluateAndGrant>>;
        try {
          results = await d.promotionEngine.evaluateAndGrant({
            tenantId: ctx.tenantId,
            trigger: "coupon_redeem",
            couponCode: input.code.toUpperCase().trim(),
          });
        } catch (err) {
          logger.error("billing.applyCoupon failed", {
            error: String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired coupon code" });
        }
        if (results.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid, expired, or already-used coupon code" });
        }
        const totalCredits = results.reduce((sum, r) => sum + r.creditsGranted.toCents(), 0);
        return { creditsGranted: totalCredits, message: `${totalCredits} credits granted` };
      }),

    accountStatus: tenantProcedure.query(async () => {
      return { status: "active", status_reason: null, grace_deadline: null };
    }),
  });
}
