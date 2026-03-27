import { logger } from "../config/logger.js";
import type { ILedger } from "./ledger.js";

export interface TrialBalanceCronConfig {
  ledger: ILedger;
}

export interface TrialBalanceCronResult {
  balanced: boolean;
  totalDebits: number;
  totalCredits: number;
  /** Absolute difference in raw units (nanodollars). Zero when balanced. */
  differenceRaw: number;
}

/**
 * Run a trial balance check: assert that sum(debit lines) === sum(credit lines)
 * across all journal entries.
 *
 * Designed to run hourly. Logs an error on imbalance but never throws —
 * an imbalance is historical and requires human investigation, not automated action.
 */
export async function runTrialBalanceCron(cfg: TrialBalanceCronConfig): Promise<TrialBalanceCronResult> {
  const tb = await cfg.ledger.trialBalance();

  const result: TrialBalanceCronResult = {
    balanced: tb.balanced,
    totalDebits: tb.totalDebits.toRaw(),
    totalCredits: tb.totalCredits.toRaw(),
    differenceRaw: tb.difference.toRaw(),
  };

  if (!tb.balanced) {
    logger.error("LEDGER IMBALANCE DETECTED — books do not balance", {
      totalDebits: tb.totalDebits.toDisplayString(),
      totalCredits: tb.totalCredits.toDisplayString(),
      difference: tb.difference.toDisplayString(),
    });
  } else {
    logger.info("Trial balance check passed", {
      totalDebits: tb.totalDebits.toDisplayString(),
    });
  }

  return result;
}
