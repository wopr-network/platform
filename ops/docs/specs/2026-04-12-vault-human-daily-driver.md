# Vault Human Daily-Driver (operator AppRole + agent proxy)

**Date:** 2026-04-12
**Status:** COMPLETE (Mac + battleaxe)
**Trigger:** Operator access to Vault was still going through `vault-recovery.gpg` → extract root token → export `VAULT_TOKEN`. Every time. For every read. The gpg dance was supposed to be emergency-only; it had silently become the daily-driver. Time to fix.

## Goal

Eliminate the gpg-unlock-every-session loop for human/operator Vault access on Mac and battleaxe. Make `vault kv get secret/shared/*` a zero-ceremony command. Keep `vault-recovery.gpg` as true break-glass-only.

## Non-goals

- **Changing anything about service AppRoles** (paperclip/wopr/holyship/nemoclaw/chain-server/runner-autoscaler). Those already work — see `2026-03-29-vault-secrets-migration.md`.
- **Rotating the Vault root token.** Drive is already the trust boundary for `vault-recovery.gpg`; rotating root without also securing Drive differently buys nothing.
- **Replacing `vault-recovery.gpg`.** It stays. It's the floor for catastrophic recovery.

## Architecture

```
┌──────────────────────────────────┐
│ Claude Code / shell / scripts   │
│   VAULT_ADDR=http://127.0.0.1:8200 │
│   no VAULT_TOKEN                 │
└────────────┬─────────────────────┘
             │ local, unauthenticated
             ▼
┌──────────────────────────────────┐
│ Vault Agent (per host)           │
│   auto-auth: approle             │
│   role_id + secret_id from       │
│   Keychain (Mac) / file (linux)  │
│   api_proxy use_auto_auth_token  │
│     = "force"  ← replaces token  │
│   24h periodic token, renewed    │
│   automatically                  │
└────────────┬─────────────────────┘
             │ HTTPS + injected token
             ▼
        vault.wopr.bot
```

**Per-host runtime:**

| Host | Agent supervisor | Creds-at-rest |
|---|---|---|
| Mac | launchd: `~/Library/LaunchAgents/bot.wopr.vault-agent.plist` | macOS Keychain (`vault-approle-role-id`, `vault-approle-secret-id`), mirrored to `~/.config/vault-agent/{role-id,secret-id}` (0600) |
| battleaxe | systemd user unit: `~/.config/systemd/user/vault-agent.service` (linger=yes) | `~/.config/vault-agent/{role-id,secret-id}` (0600) |

## The `tsavo-admin` AppRole

Single admin-scoped AppRole shared between Mac and battleaxe. One role_id, per-host secret_ids.

**Policy (`tsavo-admin`):**
- Full `secret/*` (data + metadata, all verbs)
- `auth/approle/*` (manage AppRoles, rotate secret_ids, lookup accessors, destroy old secret_ids)
- `sys/policies/acl/*` and `sys/policy/*` (edit policies including this one)
- `cubbyhole/*`, `sys/auth` read, `sys/mounts` read
- **NOT granted:** `sys/seal`, `sys/init`, `audit/*` — these stay root-only

**Token behavior:**
- 24h periodic (auto-renews indefinitely as long as agent is alive)
- `token_ttl = 24h`, `token_max_ttl = 720h`, `token_period = 24h`
- `secret_id_ttl = 0` (never expires — must be explicitly destroyed)
- `secret_id_num_uses = 0` (unlimited)

**Why admin-scoped, not read-only:** Tsavo explicitly wants Claude to manage secrets — write/delete is a feature, not a leak. The threat model treats machine compromise as the effective floor (Drive already holds `vault-recovery.gpg`), so tiering AppRole policies doesn't raise the floor meaningfully.

## Break-glass: when to reach for `vault-recovery.gpg`

Only these paths require root:
- `sys/seal`, `sys/unseal`, `sys/init`
- `audit/*`
- Rotating the `tsavo-admin` AppRole itself if every known secret_id is compromised/destroyed
- Vault upgrade operations that require root

Everything else — including editing the `tsavo-admin` policy, rotating secret_ids, creating new AppRoles for future services — goes through the ambient proxy.

## Rotation runbook (secret_id)

Run yearly or on suspected host compromise. The critical gotcha: **minting a new secret_id does not invalidate the old one.** You must explicitly destroy old ones or they remain valid forever.

```bash
# 1. Mint new (proxy works; tsavo-admin policy can do this)
NEW=$(vault write -force -field=secret_id auth/approle/role/tsavo-admin/secret-id)

# 2a. Mac — update Keychain + mirrored files, restart agent
security add-generic-password -a tsavo -s vault-approle-secret-id -w "$NEW" -U
vault-reauth   # helper in ~/.zshrc — re-syncs files from Keychain + kickstarts launchd

# 2b. battleaxe — write file, restart systemd user unit
ssh battleaxe "echo -n '$NEW' > ~/.config/vault-agent/secret-id && chmod 600 ~/.config/vault-agent/secret-id && systemctl --user restart vault-agent.service"

# 3. Find the old accessor
vault list auth/approle/role/tsavo-admin/secret-id
# Use `vault write auth/approle/role/tsavo-admin/secret-id-accessor/lookup secret_id_accessor=<acc>`
# to inspect creation_time and identify which is old

# 4. DESTROY the old one (this is the step you'll want to forget)
vault write auth/approle/role/tsavo-admin/secret-id-accessor/destroy secret_id_accessor=<old-accessor>

# 5. Re-encrypt the gpg backup in Drive with current secret_ids
# local-secrets/2026-04-12-tsavo-admin-approle.txt.gpg
```

## Claude Code MCP integration

**Fork:** `wopr-network/vault-mcp` (forked from `rccyx/vault-mcp` upstream), branch `wopr-hardening`, commit `6667eed`.

**Hardening applied:** `create_policy` tool removed. Policy management is destructive (replaces existing policies) and rare — not worth exposing to an LLM. `vault policy write` in shell for those operations.

**Tools exposed to Claude:** `read_secret`, `create_secret`, `delete_secret` (all KV v2; delete is soft via versions).

**Wiring:**
```bash
claude mcp add --scope user vault \
  --env VAULT_ADDR=http://127.0.0.1:8200 \
  --env VAULT_TOKEN=hvs.proxy-managed \
  -- node /Users/tsavo/code/vault-mcp/dist/index.js
```

`VAULT_TOKEN` is a placeholder that exists only to pass the `hvs.` prefix validation in upstream's `envyx` schema. The local agent's `api_proxy.use_auto_auth_token = "force"` substitutes it with the real agent token on every request.

## Gotchas discovered during implementation

1. **`use_auto_auth_token = true` vs `"force"`** — `true` only injects the agent's token when the incoming request has none. MCPs and shell clients usually send *some* token, so `true` effectively does nothing in those flows. Must be `"force"` for the proxy to actually replace.

2. **Policy glob specificity wins** — `auth/approle/role/*` with full caps is overridden by a more specific `auth/approle/role/+/secret-id` with narrower caps. When adding narrower paths for clarity, make sure they include every verb you need — don't rely on falling back to the wildcard.

3. **Minting a secret_id doesn't invalidate old ones.** The pool of valid secret_ids grows unboundedly unless explicitly destroyed via `secret-id-accessor/destroy`. Rotation = mint + swap + **destroy**. Skipping destroy makes rotation a no-op security-wise.

4. **MCP reads dump full secrets into conversation context.** For secrets containing very sensitive fields (RSA keys, long-lived root creds), prefer `vault kv get -field=<field>` in shell to extract only what's needed, rather than `mcp__vault__read_secret`.

## Files changed / created

| Path | Purpose |
|---|---|
| `~/.config/vault-agent/agent.hcl` (Mac) | Agent config |
| `~/.config/vault-agent/templates/github-pat.tpl` | Template for github ops_pat file |
| `~/.config/vault/secrets/github-pat` | Rendered by agent, 0600 |
| `~/Library/LaunchAgents/bot.wopr.vault-agent.plist` | Mac supervisor |
| `~/Library/Logs/vault-agent/agent.log` | Agent logs |
| `~/.zshrc` | Sets `VAULT_ADDR=http://127.0.0.1:8200`, defines `vault-reauth` |
| `~/.config/vault-agent/agent.hcl` (battleaxe) | Agent config |
| `~/.config/systemd/user/vault-agent.service` (battleaxe) | Linux supervisor |
| `~/.bashrc` (battleaxe) | `VAULT_ADDR=http://127.0.0.1:8200` |
| `~/code/vault-mcp/` (Mac) | Fork clone, branch `wopr-hardening` |
| Vault policy `tsavo-admin` | Defined above |
| Vault AppRole `tsavo-admin` | role_id + 2 secret_ids (one per host) |
| `vault/local-secrets/2026-04-12-tsavo-admin-approle.txt.gpg` | High-tier backup of role_id + secret_ids |
| `vault/README.md` | Runtime architecture + rotation runbook added |
| `vault/local-secrets/INDEX.md` | New row for the AppRole backup |
