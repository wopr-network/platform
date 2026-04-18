/**
 * bootstrap-credits — grant credits to a tenant via the double-entry ledger.
 *
 * Usage (inside the core container):
 *   docker compose exec core node dist/bootstrap-credits.js <tenantId> <amountCents> "<reason>"
 *
 * Example:
 *   docker compose exec core node dist/bootstrap-credits.js holyship 1000 "bootstrap E2E"
 *
 * Uses the same Vault-resolved DB connection as core-server itself and posts
 * a balanced journal entry via DrizzleLedger.credit(..., "admin_grant"). This
 * is the same path the admin.creditsGrant tRPC procedure uses — safe for
 * double-entry invariants, writes to accounts + journal_entries +
 * journal_lines + account_balances atomically.
 *
 * Intended for one-off tenant bootstraps (service accounts like holyship)
 * until an admin UI / CLI is wired into the product.
 */

import { Credit } from "@wopr-network/platform-core/credits/credit";
import { DrizzleLedger } from "@wopr-network/platform-core/credits/ledger";
import { resolveSecrets } from "@wopr-network/platform-core/config";
import { createDb, createPool } from "@wopr-network/platform-core/db";

async function main(): Promise<void> {
  const [tenantId, amountCentsStr, ...reasonParts] = process.argv.slice(2);
  const reason = reasonParts.join(" ");
  if (!tenantId || !amountCentsStr || !reason) {
    process.stderr.write(
      "bootstrap-credits: usage: bootstrap-credits <tenantId> <amountCents> <reason>\n",
    );
    process.exit(2);
  }
  const amountCents = Number(amountCentsStr);
  if (!Number.isFinite(amountCents) || amountCents <= 0 || !Number.isInteger(amountCents)) {
    process.stderr.write("bootstrap-credits: amountCents must be a positive integer\n");
    process.exit(2);
  }

  const slug = process.env.PRODUCT_SLUG ?? "wopr";
  const secrets = await resolveSecrets(slug);

  const host = process.env.DB_HOST ?? "postgres";
  const name = process.env.DB_NAME ?? "platform";
  const port = process.env.DB_PORT ?? "5432";
  const password = secrets.dbPassword;
  if (!password) {
    process.stderr.write("bootstrap-credits: no db_password in Vault — check the `<slug>/prod` path.\n");
    process.exit(2);
  }

  const url =
    process.env.DATABASE_URL ??
    `postgresql://core:${encodeURIComponent(password)}@${host}:${port}/${name}`;

  const pool = createPool(url);
  const db = createDb(pool);
  const ledger = new DrizzleLedger(db);

  try {
    const entry = await ledger.credit(tenantId, Credit.fromCents(amountCents), "admin_grant", {
      description: reason,
    });
    const newBalance = await ledger.balance(tenantId);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        tenantId,
        grantedCents: amountCents,
        reason,
        journalEntryId: entry.id,
        newBalanceCents: newBalance.toCents(),
      })}\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`bootstrap-credits: failed: ${msg}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  process.stderr.write(`bootstrap-credits: unhandled: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
