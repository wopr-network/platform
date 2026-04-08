/**
 * bootstrap-agent — mint a one-time registration token for a node-agent.
 *
 * Usage (inside the core container):
 *   docker compose exec core node dist/bootstrap-agent.js
 *
 * Reads the DB password from Vault via the same AppRole path as the main
 * server (no secrets in process.env), connects to the same Postgres as
 * core-server, inserts a row in `node_registration_tokens`, and prints the
 * token on stdout as JSON. The operator copies it into `.env` as
 * `AGENT_REGISTRATION_TOKEN=<token>` and `docker compose up -d node-agent`.
 * The agent consumes the token on first boot and writes persistent
 * credentials to `/etc/wopr/credentials.json` in its volume. Subsequent
 * restarts reuse the persisted credentials; the token env var can be removed.
 *
 * The token is created with owner `system-bootstrap` —
 * `node_registration_tokens.user_id` is a plain text column (no FK), so this
 * works even on a fresh DB with no users yet. TTL is the repo default
 * (15 minutes), so mint + hand off promptly.
 */

import { resolveSecrets } from "@wopr-network/platform-core/config";
import { createDb, createPool } from "@wopr-network/platform-core/db";
import { DrizzleRegistrationTokenRepository } from "@wopr-network/platform-core/fleet";

const BOOTSTRAP_OWNER = "system-bootstrap";
const LABEL = "agent-bootstrap";

async function main(): Promise<void> {
  const slug = process.env.PRODUCT_SLUG ?? "wopr";
  const secrets = await resolveSecrets(slug);

  const host = process.env.DB_HOST ?? "postgres";
  const name = process.env.DB_NAME ?? "platform";
  const port = process.env.DB_PORT ?? "5432";
  const password = secrets.dbPassword;
  if (!password) {
    process.stderr.write("bootstrap-agent: no db_password in Vault — check the `<slug>/prod` path.\n");
    process.exit(2);
  }

  const databaseUrl = `postgresql://core:${encodeURIComponent(password)}@${host}:${port}/${name}`;
  const pool = createPool(databaseUrl);
  try {
    const db = createDb(pool);
    const repo = new DrizzleRegistrationTokenRepository(db);
    const { token, expiresAt } = await repo.create(BOOTSTRAP_OWNER, LABEL);

    // Print as JSON so shell pipelines can jq it.
    process.stdout.write(
      `${JSON.stringify({
        token,
        expiresAt,
        expiresAtIso: new Date(expiresAt * 1000).toISOString(),
        owner: BOOTSTRAP_OWNER,
        label: LABEL,
      })}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`bootstrap-agent: failed to mint token: ${message}\n`);
  process.exit(1);
});
