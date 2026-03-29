import type { ILedger } from "@wopr-network/platform-core/credits";
import { Credit, InsufficientBalanceError } from "@wopr-network/platform-core/credits";
import { logger } from "../../config/logger.js";
import type { IBotInstanceRepository } from "../../fleet/bot-instance-repository.js";
import { RESOURCE_TIERS } from "../../fleet/resource-tiers.js";

/** Monthly bot cost in dollars. */
export const MONTHLY_BOT_COST_DOLLARS = 5;

/**
 * Compute the daily bot cost for a given date, prorated by the actual
 * number of days in that month. Uses nano-dollar precision so totals
 * sum to exactly $5.00/month (no over/under-billing).
 */
export function dailyBotCost(date: string): Credit {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Credit.fromDollars(MONTHLY_BOT_COST_DOLLARS / daysInMonth);
}

/**
 * @deprecated Use dailyBotCost(date) for accurate per-month proration.
 * Kept for backwards compat in tests.
 */
export const DAILY_BOT_COST = Credit.fromCents(17);

/** Callback invoked when a tenant's balance hits zero during deduction. */
export type OnSuspend = (tenantId: string) => void | Promise<void>;

/** Resolve the number of active bots for a given tenant. */
export type GetActiveBotCount = (tenantId: string) => number | Promise<number>;

/** Low balance threshold ($1.00 = 20% of signup grant). */
export const LOW_BALANCE_THRESHOLD = Credit.fromCents(100);

export interface RuntimeCronConfig {
  ledger: ILedger;
  getActiveBotCount: GetActiveBotCount;
  /** The date being billed, as YYYY-MM-DD. Used for idempotency. */
  date: string;
  onSuspend?: OnSuspend;
  /** Called when balance drops below LOW_BALANCE_THRESHOLD ($1.00). */
  onLowBalance?: (tenantId: string, balance: Credit) => void | Promise<void>;
  /** Called when balance hits exactly 0 or goes negative. */
  onCreditsExhausted?: (tenantId: string) => void | Promise<void>;
  /**
   * Optional: returns total daily resource tier surcharge for a tenant.
   * Sum of all active bots' tier surcharges. If not provided, no surcharge is applied.
   */
  getResourceTierCosts?: (tenantId: string) => Credit | Promise<Credit>;
  /**
   * Optional: returns total daily storage tier surcharge for a tenant.
   * Sum of all active bots' storage tier costs. If not provided, no surcharge applied.
   */
  getStorageTierCosts?: (tenantId: string) => Credit | Promise<Credit>;
  /**
   * Optional: returns total daily addon cost for a tenant.
   * Sum of all enabled infrastructure add-ons. If not provided, no addon charge.
   */
  getAddonCosts?: (tenantId: string) => Credit | Promise<Credit>;
}

export interface RuntimeCronResult {
  processed: number;
  suspended: string[];
  errors: string[];
  /** Tenant IDs skipped because they were already billed for this date. */
  skipped: string[];
}

/**
 * Build a `getResourceTierCosts` callback suitable for passing to `runRuntimeDeductions`.
 *
 * Sums the daily surcharge of all active bots owned by a tenant by reading each
 * bot's resource tier from `IBotInstanceRepository` and looking up the cost in
 * `RESOURCE_TIERS`. Standard-tier bots contribute 0 cents.
 */
export function buildResourceTierCosts(
  botInstanceRepo: IBotInstanceRepository,
  getBotBillingActiveIds: (tenantId: string) => Promise<string[]>,
): (tenantId: string) => Promise<Credit> {
  return async (tenantId: string): Promise<Credit> => {
    const botIds = await getBotBillingActiveIds(tenantId);
    let total = Credit.ZERO;
    for (const botId of botIds) {
      const tier = (await botInstanceRepo.getResourceTier(botId)) ?? "standard";
      const tierKey = tier in RESOURCE_TIERS ? (tier as keyof typeof RESOURCE_TIERS) : "standard";
      total = total.add(RESOURCE_TIERS[tierKey].dailyCost);
    }
    return total;
  };
}

/**
 * Returns true when `err` is a Postgres unique-constraint violation (SQLSTATE 23505).
 * Used to detect a concurrent cron run that already inserted the same referenceId.
 */
function isUniqueConstraintViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  if (code === "23505") return true;
  const msg = err.message;
  return msg.includes("UNIQUE") || msg.includes("duplicate key");
}

/**
 * Daily runtime deduction cron.
 *
 * For each tenant with a positive balance:
 * 1. Look up active bot count
 * 2. Debit (bots * DAILY_BOT_COST) from their balance
 * 3. If balance is insufficient, debit what's available and trigger suspension
 */
export async function runRuntimeDeductions(cfg: RuntimeCronConfig): Promise<RuntimeCronResult> {
  const result: RuntimeCronResult = {
    processed: 0,
    suspended: [],
    errors: [],
    skipped: [],
  };

  const tenants = await cfg.ledger.tenantsWithBalance();

  for (const { tenantId, balance } of tenants) {
    try {
      const runtimeRef = `runtime:${cfg.date}:${tenantId}`;
      const runtimeAlreadyBilled = await cfg.ledger.hasReferenceId(runtimeRef);

      const botCount = await cfg.getActiveBotCount(tenantId);
      if (botCount <= 0) {
        if (runtimeAlreadyBilled) result.skipped.push(tenantId);
        continue;
      }

      const dailyCost = dailyBotCost(cfg.date);
      const totalCost = dailyCost.multiply(botCount);
      let didBillAnything = false;

      // Bill runtime debit (skipped if already billed on a previous run)
      if (!runtimeAlreadyBilled) {
        if (!balance.lessThan(totalCost)) {
          // Full deduction
          await cfg.ledger.debit(tenantId, totalCost, "bot_runtime", {
            description: `Daily runtime: ${botCount} bot(s) x $${dailyCost.toDollars().toFixed(4)}`,
            referenceId: runtimeRef,
          });
        } else {
          // Partial deduction — balance insufficient to cover full cost; debit what's available and suspend
          if (balance.greaterThan(Credit.ZERO)) {
            await cfg.ledger.debit(tenantId, balance, "bot_runtime", {
              description: `Partial daily runtime (balance exhausted): ${botCount} bot(s)`,
              referenceId: runtimeRef,
            });
          }
          if (!result.suspended.includes(tenantId)) {
            result.suspended.push(tenantId);
            if (cfg.onSuspend) await cfg.onSuspend(tenantId);
          }
        }
        didBillAnything = true;
      }

      // Debit resource tier surcharges (if any) — independent idempotency
      if (cfg.getResourceTierCosts) {
        const tierRef = `runtime-tier:${cfg.date}:${tenantId}`;
        if (!(await cfg.ledger.hasReferenceId(tierRef))) {
          const tierCost = await cfg.getResourceTierCosts(tenantId);
          if (!tierCost.isZero()) {
            const balanceAfterRuntime = await cfg.ledger.balance(tenantId);
            if (!balanceAfterRuntime.lessThan(tierCost)) {
              await cfg.ledger.debit(tenantId, tierCost, "resource_upgrade", {
                description: "Daily resource tier surcharge",
                referenceId: tierRef,
              });
            } else if (balanceAfterRuntime.greaterThan(Credit.ZERO)) {
              await cfg.ledger.debit(tenantId, balanceAfterRuntime, "resource_upgrade", {
                description: "Partial resource tier surcharge (balance exhausted)",
                referenceId: tierRef,
              });
            }
            didBillAnything = true;
          }
        }
      }

      const newBalance = await cfg.ledger.balance(tenantId);

      // Fire onLowBalance if balance crossed below threshold from above
      if (
        newBalance.greaterThan(Credit.ZERO) &&
        !newBalance.greaterThan(LOW_BALANCE_THRESHOLD) &&
        balance.greaterThan(LOW_BALANCE_THRESHOLD) &&
        cfg.onLowBalance
      ) {
        await cfg.onLowBalance(tenantId, newBalance);
      }

      // Fire onCreditsExhausted if balance just hit 0
      if (!newBalance.greaterThan(Credit.ZERO) && balance.greaterThan(Credit.ZERO) && cfg.onCreditsExhausted) {
        await cfg.onCreditsExhausted(tenantId);
      }

      // Suspend tenant when balance hits zero (zero-crossing guard)
      if (
        !newBalance.greaterThan(Credit.ZERO) &&
        balance.greaterThan(Credit.ZERO) &&
        !result.suspended.includes(tenantId)
      ) {
        result.suspended.push(tenantId);
        if (cfg.onSuspend) {
          await cfg.onSuspend(tenantId);
        }
      }

      // Debit storage tier surcharges (if any) — independent idempotency
      if (cfg.getStorageTierCosts) {
        const storageRef = `runtime-storage:${cfg.date}:${tenantId}`;
        if (!(await cfg.ledger.hasReferenceId(storageRef))) {
          const storageCost = await cfg.getStorageTierCosts(tenantId);
          if (!storageCost.isZero()) {
            const currentBalance = await cfg.ledger.balance(tenantId);
            if (!currentBalance.lessThan(storageCost)) {
              await cfg.ledger.debit(tenantId, storageCost, "storage_upgrade", {
                description: "Daily storage tier surcharge",
                referenceId: storageRef,
              });
            } else {
              // Partial debit — take what's left, then suspend
              if (currentBalance.greaterThan(Credit.ZERO)) {
                await cfg.ledger.debit(tenantId, currentBalance, "storage_upgrade", {
                  description: "Partial storage tier surcharge (balance exhausted)",
                  referenceId: storageRef,
                });
              }
              if (!result.suspended.includes(tenantId)) {
                result.suspended.push(tenantId);
                if (cfg.onSuspend) await cfg.onSuspend(tenantId);
              }
            }
            didBillAnything = true;
          }
        }
      }

      // Debit infrastructure add-on costs (if any) — independent idempotency
      if (cfg.getAddonCosts) {
        const addonRef = `runtime-addon:${cfg.date}:${tenantId}`;
        if (!(await cfg.ledger.hasReferenceId(addonRef))) {
          const addonCost = await cfg.getAddonCosts(tenantId);
          if (!addonCost.isZero()) {
            const currentBalance = await cfg.ledger.balance(tenantId);
            if (!currentBalance.lessThan(addonCost)) {
              await cfg.ledger.debit(tenantId, addonCost, "addon", {
                description: "Daily infrastructure add-on charges",
                referenceId: addonRef,
              });
            } else {
              // Partial debit — take what's left, then suspend
              if (currentBalance.greaterThan(Credit.ZERO)) {
                await cfg.ledger.debit(tenantId, currentBalance, "addon", {
                  description: "Partial add-on charges (balance exhausted)",
                  referenceId: addonRef,
                });
              }
              if (!result.suspended.includes(tenantId)) {
                result.suspended.push(tenantId);
                if (cfg.onSuspend) await cfg.onSuspend(tenantId);
              }
            }
            didBillAnything = true;
          }
        }
      }

      if (didBillAnything) {
        result.processed++;
      } else {
        result.skipped.push(tenantId);
      }
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        result.suspended.push(tenantId);
        if (cfg.onSuspend) {
          await cfg.onSuspend(tenantId);
        }
        result.processed++;
      } else if (isUniqueConstraintViolation(err)) {
        // Concurrent cron run already committed this referenceId — treat as already billed.
        result.skipped.push(tenantId);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Runtime deduction failed", { tenantId, error: msg });
        result.errors.push(`${tenantId}: ${msg}`);
      }
    }
  }

  return result;
}
