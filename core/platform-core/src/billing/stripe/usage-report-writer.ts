import crypto from "node:crypto";
import type Stripe from "stripe";
import { logger } from "../../config/logger.js";
import { Credit } from "../../credits/credit.js";
import type { IBillingPeriodSummaryRepository } from "./billing-period-summary-repository.js";
import type { MeteredPriceConfig } from "./metered-price-map.js";
import type { ITenantCustomerRepository } from "./tenant-store.js";
import type { IStripeUsageReportRepository } from "./usage-report-repository.js";

export interface UsageReportWriterConfig {
  stripe: Stripe;
  tenantRepo: ITenantCustomerRepository;
  billingPeriodSummaryRepo: IBillingPeriodSummaryRepository;
  usageReportRepo: IStripeUsageReportRepository;
  meteredPriceMap: ReadonlyMap<string, MeteredPriceConfig>;
  /** Start of the billing period to report (unix epoch ms, inclusive). */
  periodStart: number;
  /** End of the billing period to report (unix epoch ms, exclusive). */
  periodEnd: number;
}

export interface UsageReportResult {
  tenantsProcessed: number;
  reportsCreated: number;
  reportsSkipped: number;
  errors: Array<{ tenant: string; capability: string; error: string }>;
}

/**
 * Report metered usage to Stripe for all metered tenants in a given billing period.
 *
 * Uses Stripe's Billing Meters API (stripe.billing.meterEvents.create) — the v20
 * replacement for the legacy subscriptionItems.createUsageRecord API.
 *
 * Flow:
 * 1. Query billingPeriodSummaries for the period window
 * 2. Filter to tenants with inferenceMode === "metered"
 * 3. For each (tenant, capability, provider) tuple:
 *    a. Check if already reported (idempotent via stripeUsageReports unique index)
 *    b. Submit meter event to Stripe with idempotency identifier
 *    c. Insert into stripeUsageReports
 */
export async function runUsageReportWriter(cfg: UsageReportWriterConfig): Promise<UsageReportResult> {
  const result: UsageReportResult = {
    tenantsProcessed: 0,
    reportsCreated: 0,
    reportsSkipped: 0,
    errors: [],
  };

  // 1. Find all metered tenants
  const meteredTenants = await cfg.tenantRepo.listMetered();

  if (meteredTenants.length === 0) return result;

  const meteredTenantIds = new Set(meteredTenants.map((t) => t.tenant));
  const customerIdMap = new Map(meteredTenants.map((t) => [t.tenant, t.processorCustomerId]));

  // 2. Query billing period summaries for this period
  const summaries = await cfg.billingPeriodSummaryRepo.listByPeriodWindow(cfg.periodStart, cfg.periodEnd);

  // 3. Filter to metered tenants only
  const meteredSummaries = summaries.filter((s) => meteredTenantIds.has(s.tenant));

  const processedTenants = new Set<string>();

  for (const summary of meteredSummaries) {
    const { tenant, capability, provider, totalCharge } = summary;

    // Skip zero usage
    if (totalCharge <= 0) continue;

    // Skip capabilities without a metered price config
    const priceConfig = cfg.meteredPriceMap.get(capability);
    if (!priceConfig) continue;

    processedTenants.add(tenant);

    try {
      // Check if already reported (idempotent)
      const existing = await cfg.usageReportRepo.getByTenantAndPeriod(
        tenant,
        capability,
        provider,
        summary.periodStart,
      );
      if (existing) {
        result.reportsSkipped++;
        continue;
      }

      // Look up Stripe customer ID
      const customerId = customerIdMap.get(tenant);
      if (!customerId) {
        result.errors.push({ tenant, capability, error: "No Stripe customer ID" });
        continue;
      }

      // Convert nanodollars to cents
      const valueCents = Credit.fromRaw(totalCharge).toCentsRounded();

      // Build a stable idempotency identifier: tenant + capability + provider + periodStart
      const identifier = `${tenant}:${capability}:${provider}:${summary.periodStart}`;

      // Submit to Stripe Billing Meters API (v20+)
      await cfg.stripe.billing.meterEvents.create({
        event_name: priceConfig.eventName,
        payload: {
          stripe_customer_id: customerId,
          value: String(valueCents),
        },
        identifier,
        timestamp: Math.floor(summary.periodStart / 1000),
      });

      // Insert local record
      await cfg.usageReportRepo.insert({
        id: crypto.randomUUID(),
        tenant,
        capability,
        provider,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        eventName: priceConfig.eventName,
        valueCents,
        reportedAt: Date.now(),
      });

      result.reportsCreated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to report usage to Stripe", { tenant, capability, error: msg });
      result.errors.push({ tenant, capability, error: msg });
    }
  }

  result.tenantsProcessed = processedTenants.size;
  return result;
}
