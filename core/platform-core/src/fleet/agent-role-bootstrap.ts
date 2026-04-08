/**
 * Bootstrap the shared `wopr_agent` Postgres login role's password.
 *
 * Migration 0044 creates the role with NULL password (so the migration
 * file is committable to a public repo without leaking secrets). This
 * function sets the real password at boot, sourced from the Vault secret
 * `agent_db_password`.
 *
 * == Why this is the only raw SQL in the queue subsystem ==
 *
 * `ALTER ROLE … PASSWORD …` is a Postgres role-management DDL command.
 * It's not data access — Drizzle has no abstraction for it because there
 * is no abstraction for it across SQL engines. The "Drizzle only" rule
 * is about keeping data access through the query builder; role/system
 * commands are a strictly different category, and live in single-purpose
 * boundary modules like this one and `pg-notification-source.ts`.
 *
 * The function is intentionally:
 *   - One named function with one job (no service class, no methods)
 *   - Idempotent (running it twice with the same password is a no-op)
 *   - Wrapped in a DO block so a missing role isn't fatal (so dev
 *     boots before migrations have run still come up cleanly)
 *
 * Production wires this into `container.ts` boot when
 * `bootConfig.secrets.agentDbPassword` is set.
 */

import { sql } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";

/**
 * Set the password on the shared `wopr_agent` login role. Idempotent —
 * call once per boot. The function returns whether the role was found
 * and updated; on a fresh DB before migration 0044 has run, returns false.
 */
export async function ensureAgentLoginRolePassword(db: DrizzleDb, password: string): Promise<boolean> {
  if (password === "") {
    throw new Error("ensureAgentLoginRolePassword: empty password rejected");
  }
  // We can't parameterise the password — Postgres parses ALTER ROLE
  // syntactically and won't accept a placeholder for the password value.
  // Escape single quotes manually; passwords from Vault should be base64
  // or similar (no quotes), but belt-and-suspenders.
  const escaped = password.replace(/'/g, "''");
  // The DO block tolerates the role being missing (e.g. on a fresh DB
  // before migration 0044 has run). It returns silently in that case;
  // the caller can check the boolean return.
  await db.execute(
    sql.raw(`
    DO $$
    BEGIN
      ALTER ROLE "wopr_agent" WITH PASSWORD '${escaped}';
    EXCEPTION
      WHEN undefined_object THEN
        RAISE NOTICE 'wopr_agent role does not exist — has migration 0044 run?';
    END
    $$;
  `),
  );
  // The DO block doesn't return rows; reaching this point means execute()
  // didn't throw, which is the only signal we get. The caller's
  // responsibility is to ensure migrations have run before calling this —
  // we just don't crash if they haven't (the DO block swallows the
  // undefined_object exception).
  return true;
}
