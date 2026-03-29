# Incident Report: Credential Breach via Committed .env

**Date:** 2026-03-29
**Severity:** Critical
**Duration:** Unknown exposure window → 2026-03-29 remediation complete
**Status:** Resolved

## Summary

A `.env.production` file containing all production secrets was committed to the `wopr-ops` repository while it was public. An attacker used the exposed Postmark API token to send 10,457 phishing emails from verified WOPR domains, impersonating platform transactional emails.

## Timeline

| Time | Event |
|------|-------|
| Unknown | `.env.production` committed to wopr-ops repo (public at the time) |
| 2026-03-29 ~14:00 UTC | Discovery: Postmark dashboard shows 10,457 outbound emails not sent by the platform |
| 2026-03-29 ~14:10 UTC | Holyship API stopped immediately to prevent further abuse |
| 2026-03-29 ~14:15 UTC | `.env.production` and `.env` files removed from git history |
| 2026-03-29 ~14:30 UTC | All external API keys revoked at source (Postmark, OpenRouter, DigitalOcean, GitHub App, GHCR, Stripe x4, Cloudflare) |
| 2026-03-29 ~15:00 UTC | New credentials generated for all services |
| 2026-03-29 ~15:30 UTC | HashiCorp Vault deployed at vault.wopr.bot |
| 2026-03-29 ~16:00 UTC | All rotated secrets stored in Vault with per-product AppRole isolation |
| 2026-03-29 ~17:00 UTC | Paperclip migrated to Vault (first product, proof of concept) |
| 2026-03-29 ~18:30 UTC | WOPR, Holyship, NemoClaw migrated to Vault |
| 2026-03-29 ~19:00 UTC | All .env backup files deleted from VPSes |
| 2026-03-29 ~19:30 UTC | process.env reads for secrets eliminated from platform-core |
| 2026-03-29 ~20:00 UTC | Email switched from Postmark to Resend (4 domains verified) |

## Root Cause

1. `.env.production` was committed to `wopr-ops` git repository
2. `wopr-ops` was a public GitHub repository at the time
3. The file contained ALL production secrets: API keys, database passwords, Stripe keys, Postmark tokens, auth secrets
4. No credential rotation policy existed — same secrets since initial deployment
5. No secrets management system — all secrets lived in plaintext `.env` files on VPS disk

## Impact

- **10,457 phishing emails** sent from compromised Postmark token using verified WOPR domains
- **Postmark account** likely permanently banned (switched to Resend)
- **All credentials compromised** across all 4 products (Paperclip, WOPR, Holyship, NemoClaw)
- **Holyship API** taken offline for several hours during remediation
- **Reputation risk** — phishing emails came from legitimate wopr.bot/holyship.wtf domains

## What Was Compromised

| Secret | Risk | Action Taken |
|--------|------|-------------|
| Postmark API token | Used for phishing | Revoked, switched to Resend |
| OpenRouter API key | Could consume inference budget | Revoked, rotated |
| DigitalOcean API token | Could provision/destroy droplets | Revoked, rotated |
| GitHub App credentials | Could access org repos, create PRs | Revoked, rotated |
| GHCR PAT | Could push malicious container images | Revoked, rotated |
| Stripe keys (4 products) | Could create charges, read customer data | Revoked, rotated |
| Cloudflare API token | Could modify DNS, SSL, firewall rules | Revoked, replaced with 12 scoped tokens |
| BETTER_AUTH_SECRET (4 products) | Could forge session tokens | Rotated (breaks existing sessions) |
| PLATFORM_SECRET | Could decrypt credential vault | Rotated |
| PLATFORM_ENCRYPTION_SECRET | Could decrypt stored data | Rotated |
| Database passwords | Direct DB access if network exposed | Rotated |

## Remediation

### Immediate (Day 0)

1. Stopped Holyship API to prevent further phishing
2. Removed .env files from git history
3. Revoked ALL external API keys at each provider's dashboard
4. Generated new credentials for every service

### Structural (Day 0)

1. **Deployed HashiCorp Vault** at vault.wopr.bot on chain-server VPS
   - Raft storage, Caddy TLS, auto-unseal via systemd
   - Per-product AppRole isolation (each product can only read its own secrets)
   - Encrypted backup on Google Drive

2. **Migrated all 4 products to Vault**
   - `resolveSecrets(slug)` reads from Vault at boot
   - Zero secrets in compose files, Docker images, or .env files
   - Fail-closed: no Vault = no boot

3. **Eliminated process.env for secrets** in platform-core
   - All secret reads go through `PlatformSecrets` object
   - Dev fallback returns dummy values (no env reads)
   - Deleted all `*FromEnv()` factory functions

4. **Replaced Cloudflare single API token** with 12 scoped tokens
   - dns_edit, ssl_edit, cache_purge, page_rules, firewall_edit, lb_edit, workers_edit, r2_edit, email_routing, tunnel_edit, access_edit, analytics_read

5. **Switched email from Postmark to Resend**
   - 4 domains verified (runpaperclip.com, wopr.bot, holyship.wtf, nemopod.com)
   - DKIM records propagated

## Prevention

| Before | After |
|--------|-------|
| Secrets in `.env` on disk | Secrets in Vault only (memory at runtime) |
| Secrets in git history | Git has zero secrets |
| Secrets in Docker image ENV | Images have zero secrets |
| Secrets in docker-compose.yml | Compose has zero secrets |
| Same secret across all products | Per-product AppRole isolation |
| No audit trail | Vault audit log of every access |
| No rotation without SSH | Rotate in Vault, restart container |
| Single Cloudflare god-token | 12 scoped tokens (least privilege) |
| No credential rotation policy | Vault enables rotation without deploy |

## Lessons Learned

1. **Never commit .env files** — the gitignore existed but was bypassed. Need pre-commit hooks that block secrets.
2. **Least privilege from day one** — a single API token for Cloudflare meant the attacker got everything. Scoped tokens limit blast radius.
3. **Secrets management is infrastructure, not a nice-to-have** — Vault should have been deployed before the first production secret was created.
4. **Fail closed** — the platform now refuses to boot without Vault. This is correct. A graceful degradation for secrets is a security hole.
5. **Rotation must be painless** — if rotating a secret requires SSHing to 4 VPSes and editing files, it won't happen. Vault makes it a single API call.

## Open Items

- [ ] Revoke Vault root token (waiting for stability confirmation)
- [ ] Move Stripe price IDs from compose env to product_config DB
- [ ] Pre-commit hook to detect secrets in staged files
- [ ] Vault audit log forwarding to monitoring
