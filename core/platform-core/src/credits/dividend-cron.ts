import { logger } from "../config/logger.js";
import { Credit } from "./credit.js";
import type { ILedger } from "./ledger.js";

export interface DividendCronConfig {
  ledger: ILedger;
  /** Fraction of daily purchases matched as dividend pool. Default 1.0 (100%). */
  matchRate: number;
  /** The date to compute dividend for, as YYYY-MM-DD string. Typically yesterday. */
  targetDate: string;
}

export interface DividendCronResult {
  pool: Credit;
  activeCount: number;
  perUser: Credit;
  distributed: number;
  skippedAlreadyRun: boolean;
  errors: string[];
}

/**
 * Compute and distribute the community dividend for a given day.
 *
 * 1. Check idempotency — skip if already run for this date.
 * 2. Sum all 'purchase' entries for the target date.
 * 3. Find all tenants with a 'purchase' entry in the last 7 days.
 * 4. Compute pool = sum × matchRate, per-user share = floor(pool / activeCount).
 * 5. Credit each active tenant with their share.
 */
export async function runDividendCron(cfg: DividendCronConfig): Promise<DividendCronResult> {
  const result: DividendCronResult = {
    pool: Credit.ZERO,
    activeCount: 0,
    perUser: Credit.ZERO,
    distributed: 0,
    skippedAlreadyRun: false,
    errors: [],
  };

  const sentinelPrefix = `dividend:${cfg.targetDate}:`;
  const alreadyRan = await cfg.ledger.existsByReferenceIdLike(`${sentinelPrefix}%`);

  if (alreadyRan) {
    result.skippedAlreadyRun = true;
    logger.info("Dividend cron already ran for this date", { targetDate: cfg.targetDate });
    return result;
  }

  const dayStart = `${cfg.targetDate} 00:00:00`;
  const dayEnd = `${cfg.targetDate} 24:00:00`;

  const dailyPurchaseTotal = await cfg.ledger.sumPurchasesForPeriod(dayStart, dayEnd);
  result.pool = dailyPurchaseTotal.multiply(cfg.matchRate);

  const windowStart = subtractDays(cfg.targetDate, 6);
  const windowStartTs = `${windowStart} 00:00:00`;

  const activeTenantIds = await cfg.ledger.getActiveTenantIdsInWindow(windowStartTs, dayEnd);
  result.activeCount = activeTenantIds.length;

  if (result.pool.isZero() || result.activeCount <= 0) {
    logger.info("Dividend cron: no pool or no active tenants", {
      targetDate: cfg.targetDate,
      pool: result.pool.toCents(),
      activeCount: result.activeCount,
    });
    return result;
  }

  result.perUser = Credit.fromRaw(Math.floor(result.pool.toRaw() / result.activeCount));

  if (result.perUser.isZero()) {
    logger.info("Dividend cron: per-user share rounds to zero", {
      targetDate: cfg.targetDate,
      pool: result.pool.toCents(),
      activeCount: result.activeCount,
    });
    return result;
  }

  for (const tenantId of activeTenantIds) {
    const perUserRef = `dividend:${cfg.targetDate}:${tenantId}`;
    try {
      await cfg.ledger.credit(tenantId, result.perUser, "community_dividend", {
        description: `Community dividend for ${cfg.targetDate}: pool ${result.pool.toCents()}c / ${result.activeCount} users`,
        referenceId: perUserRef,
      });
      result.distributed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Dividend distribution failed for tenant", { tenantId, error: msg });
      result.errors.push(`${tenantId}: ${msg}`);
    }
  }

  logger.info("Dividend cron complete", {
    targetDate: cfg.targetDate,
    pool: result.pool.toCents(),
    activeCount: result.activeCount,
    perUser: result.perUser.toCents(),
    distributed: result.distributed,
    errors: result.errors.length,
  });

  return result;
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
