# Response to Postmark — Incident Investigation

## 1. Source of the leak and steps taken to prevent recurrence

The API token was exposed via a `.env.production` file that was accidentally committed to a GitHub repository (`wopr-ops`) while the repository was public. The file contained production credentials for multiple services including the Postmark server token. An unauthorized party discovered the token and used it to send phishing emails through our verified domains.

**Steps taken to prevent recurrence:**

- The `.env.production` file was immediately removed from the repository and scrubbed from git history
- ALL credentials across all services were rotated within hours of discovery
- We deployed HashiCorp Vault as our secrets management system — no secrets are stored on disk, in environment files, or in git. All secrets are fetched at runtime from Vault via authenticated AppRole tokens with per-product isolation
- We eliminated all `process.env` reads for secrets from our codebase — secrets are injected programmatically from Vault at boot time
- Pre-commit hooks are being added to detect secrets in staged files before they can be committed
- The repository that contained the leak has been made private

## 2. Nature of business and products/services

We operate a multi-product SaaS platform:

- **WOPR** (wopr.bot) — AI agent hosting and orchestration platform. Users deploy and manage AI-powered chatbots with multi-channel support (Discord, Slack, Teams, WhatsApp)
- **Paperclip** (runpaperclip.com) — AI-powered business automation platform for task management and workflow orchestration
- **Holy Ship** (holyship.wtf) — Software engineering automation platform with GitHub integration for CI/CD workflow management
- **NemoPod** (nemopod.com) — AI development environment and coding assistant platform

All four products are B2B SaaS platforms serving developers and businesses.

## 3. How contacts are sourced/managed

Contacts are exclusively users who have registered accounts on our platforms through our signup flow with email verification. We do not purchase, scrape, or import contact lists. Each user provides their email address during account registration and must verify it before gaining access. Contact data is stored in PostgreSQL databases on our infrastructure and is not shared with third parties.

## 4. Types of messages we intend to send

All messages are transactional in nature:

- **Account verification** — Email address confirmation during signup
- **Password reset** — Secure password recovery links
- **Billing notifications** — Credit balance alerts, payment confirmations, invoice receipts
- **Platform alerts** — Instance provisioning status, deployment notifications, service health updates
- **Team invitations** — Organization membership invites

We do not send marketing emails, newsletters, or promotional content through Postmark. All messages are triggered by user actions on the platform.
