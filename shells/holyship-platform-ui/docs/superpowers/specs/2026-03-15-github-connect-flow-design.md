# GitHub App Connect Flow — Design Spec

## Goal

Three clicks from landing page to working product. No signup forms, no passwords, no friction.

1. Click "Install the GitHub App" on landing page
2. Authorize on GitHub
3. Dashboard

## Flow

```
holyship.wtf → "Install the GitHub App"
  → redirect to github.com/apps/holyship/installations/new
    → GitHub App has "Request user authorization during installation" enabled
    → user installs app + authorizes OAuth in one step
      → GitHub redirects to /connect/callback?installation_id=X&setup_action=install
        → better-auth handles GitHub OAuth (session, account upsert)
        → link installation_id to tenant
        → redirect to /dashboard
```

## Auth Strategy

**Use better-auth's built-in GitHub social provider.** Platform-core already supports `socialProviders.github` with OAuth callback at `/api/auth/callback/github`. Holy Ship does NOT hand-roll OAuth. The GitHub App's built-in OAuth (not a separate OAuth App) is used for both install and login flows.

**GitHub App settings required:**
- "Request user authorization (OAuth) during installation" = enabled
- Callback URL = `https://holyship.wtf/api/auth/callback/github`
- Setup URL = `https://holyship.wtf/connect/callback`

## Pages

### `/connect` (redirect, not a page)

Immediately redirects to `https://github.com/apps/holyship/installations/new`. No intermediate UI. The user clicked the button — send them to GitHub.

### `/connect/callback`

Client-side page. Receives GitHub's post-install redirect:

1. **Read** `installation_id` and `setup_action` from URL params
2. **Handle** `setup_action`:
   - `install` → happy path, continue
   - `update` → user already has app, redirect to `/dashboard`
   - `request` → org admin requested install, show "waiting for approval" message
3. **Store** `installation_id` in sessionStorage
4. **Check** if user has an active better-auth session
   - Yes → call backend to link `installation_id` to tenant → redirect to `/dashboard`
   - No → redirect to better-auth GitHub OAuth (`/api/auth/signin/github` with `callbackUrl=/connect/complete`)

### `/connect/complete`

Post-auth landing. User now has a session (better-auth created/found account via GitHub OAuth):

1. **Read** `installation_id` from sessionStorage
2. **Call** backend `POST /api/github/link-installation` with `{ installationId }`
3. **Clear** sessionStorage
4. **Redirect** to `/dashboard`

### `/login`

Single button: "Log in with GitHub". Triggers better-auth GitHub OAuth flow. On successful auth, redirects to `/dashboard`. If no account exists, better-auth creates one via `onUserCreated` hook (which auto-provisions a tenant via platform-core pattern).

## Tenant Provisioning

- **Auto-provisioned** via platform-core's `onUserCreated` hook — one personal tenant per GitHub user
- **Installation linking** stored in holyship-platform's existing `github_installations` table (created in chunk 3)
- Column: `tenant_id` on `github_installations` row

## Environment Variables

```
# GitHub App
GITHUB_APP_ID=...
GITHUB_APP_URL=https://github.com/apps/holyship
GITHUB_CLIENT_ID=...          # From GitHub App's OAuth settings
GITHUB_CLIENT_SECRET=...      # From GitHub App's OAuth settings
GITHUB_APP_PRIVATE_KEY=...    # base64-encoded PEM

# Platform-core auth (required by better-auth)
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=https://holyship.wtf
```

## What's NOT in scope

- Multiple auth providers
- Email/password fallback
- GitHub organization-level permissions UI
- Multi-tenant (one tenant per GitHub user at launch)
- Repo selection UI (GitHub's native install flow handles this)
