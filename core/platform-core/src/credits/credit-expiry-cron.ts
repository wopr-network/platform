import { logger } from "../config/logger.js";
import type { ILedger } from "./ledger.js";

export interface CreditExpiryCronConfig {
  ledger: ILedger;
  /** Current time as ISO-8601 string. */
  now: string;
}

export interface CreditExpiryCronResult {
  processed: number;
  expired: string[];
  errors: string[];
  skippedZeroBalance: number;
}

/**
 * Sweep expired credit grants and debit the original grant amount
 * (or remaining balance if partially consumed).
 *
 * Idempotent: uses `expiry:<original_txn_id>` as referenceId.
 */
export async function runCreditExpiryCron(cfg: CreditExpiryCronConfig): Promise<CreditExpiryCronResult> {
  const result: CreditExpiryCronResult = {
    processed: 0,
    expired: [],
    errors: [],
    skippedZeroBalance: 0,
  };

  const expiredGrants = await cfg.ledger.expiredCredits(cfg.now);

  for (const grant of expiredGrants) {
    try {
      // debitCapped never throws InsufficientBalanceError — it caps at the
      // available balance and returns null when balance is zero. The catch
      // below handles unexpected errors (DB failures, constraint violations).
      const entry = await cfg.ledger.debitCapped(grant.tenantId, grant.amount, "credit_expiry", {
        description: `Expired credit grant reclaimed: ${grant.entryId}`,
        referenceId: `expiry:${grant.entryId}`,
      });

      if (entry === null) {
        result.skippedZeroBalance++;
        continue;
      }

      result.processed++;
      if (!result.expired.includes(grant.tenantId)) {
        result.expired.push(grant.tenantId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Credit expiry failed", { tenantId: grant.tenantId, entryId: grant.entryId, error: msg });
      result.errors.push(`${grant.tenantId}:${grant.entryId}: ${msg}`);
    }
  }

  if (result.processed > 0) {
    logger.info(`Credit expiry cron: reclaimed ${result.processed} expired grants`, {
      expired: result.expired,
      skippedZeroBalance: result.skippedZeroBalance,
    });
  }

  return result;
}
