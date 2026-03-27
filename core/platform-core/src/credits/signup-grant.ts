import { Credit } from "./credit.js";
import type { ILedger } from "./ledger.js";

/** Signup grant amount: $5.00 */
export const SIGNUP_GRANT = Credit.fromDollars(5);

/**
 * Grant the signup credit bonus to a newly verified tenant.
 *
 * Idempotent: uses `signup:<tenantId>` as referenceId to prevent double-grants.
 *
 * @returns true if the grant was applied, false if already granted.
 */
export async function grantSignupCredits(ledger: ILedger, tenantId: string): Promise<boolean> {
  const refId = `signup:${tenantId}`;

  if (await ledger.hasReferenceId(refId)) {
    return false;
  }

  try {
    await ledger.credit(tenantId, SIGNUP_GRANT, "signup_grant", {
      description: "Welcome bonus — $5.00 credit on email verification",
      referenceId: refId,
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return false;
    throw err;
  }

  return true;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ((err as { code?: string }).code === "23505") return true;
  return err.message.includes("UNIQUE") || err.message.includes("duplicate key");
}
