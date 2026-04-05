# Agent Sandbox & Connected Accounts

## Problem

Dr. Yuki Tanaka (AI Gameplay Engineer) spent 41 minutes and 88K tokens failing
to run `npm install` because `NODE_ENV=production` was baked into the Docker
image. Agents also land in isolated per-agent home directories instead of
shared project workspaces, and have no access to the user's GitHub credentials
for git operations.

## Changes Shipped (Sandbox Isolation)

### Root Cause: NODE_ENV=production in Dockerfile.managed

Line 86 of `Dockerfile.managed` set `NODE_ENV=production` as a global ENV.
Every child process — including agent OpenCode sessions — inherited it.
npm/yarn silently skip devDependencies in production mode.

### Architecture: NemoClaw-style Privilege Separation

Modeled after NemoClaw's OpenShell sandbox pattern:

- **paperclip user**: runs the Paperclip API server (NODE_ENV=production)
- **sandbox user**: runs agent code via OpenCode (dev-friendly, no NODE_ENV)
- **agents group**: shared supplementary group for file access across users

### Files Changed

| File | Change |
|------|--------|
| `Dockerfile.managed` | Two users + shared `agents` group, gosu, libcap2-bin, NODE_ENV removed from global ENV |
| `managed-entrypoint.sh` (new) | Cap dropping, fork bomb protection, PATH lockdown, umask 0002, workspace + skill permissions |
| `adapter-utils/server-utils.ts` | `runChildProcess` strips NODE_ENV, wraps in `gosu sandbox`, sets HOME=/data |
| `opencode-local/execute.ts` | Injects skills into sandbox HOME (/data/.claude/skills/) |
| `opencode-local/runtime-config.ts` | chmod XDG temp dir to 0755 for sandbox readability |
| `home-paths.ts` | `resolveInstanceSharedWorkspaceDir()` for shared fallback |
| `heartbeat.ts` | Fallback uses instance shared workspace instead of per-agent dirs |

### How It Works

1. Container starts as root, drops capabilities, sets permissions
2. Server runs as `paperclip` user with NODE_ENV=production and umask 0002
3. Workspace resolves to project workspace or instance shared workspace
4. Adapter preps skills/config (group-readable via `agents` group)
5. `runChildProcess` strips NODE_ENV, sets HOME=/data, wraps in `gosu sandbox`
6. OpenCode runs as sandbox user in shared workspace with dev environment
7. npm/pip/cargo install devDependencies correctly

### Permission Model

- Workspace dirs: owned by `sandbox:agents`, writable by agents
- Skills on disk: owned by `paperclip:agents`, group-readable
- XDG temp dirs: chmod 755 for sandbox readability
- /app (server code): owned by paperclip, not writable by sandbox
- /data (agent HOME): owned by sandbox:agents
- umask 0002: all server-created files are group-accessible

---

## Next: Connected Accounts (GitHub OAuth for Agents)

### Problem

Agents cannot authenticate with GitHub. They can't clone private repos,
push commits with the user's identity, or create PRs. Git identity is
not configured.

### Design

The token flows through the API at runtime — never baked into Docker:

```
User connects GitHub (UI) → token stored in platform DB (encrypted)
                                ↓
Agent heartbeat fires → adapter fetches token from API
                                ↓
Adapter injects into env → GITHUB_TOKEN, GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL
                                ↓
OpenCode runs → git authenticates via env → process exits → token gone
```

### Implementation

**1. Platform-core: `connected_accounts` table**
```sql
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'github',
  provider_account_id TEXT NOT NULL,
  access_token TEXT NOT NULL,       -- encrypted via secrets service
  refresh_token TEXT,               -- encrypted
  username TEXT,                    -- github username
  email TEXT,                      -- github email
  scopes TEXT,                     -- comma-separated
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);
```

**2. Platform-core: API routes**
- `GET /api/connected-accounts` — list user's connected accounts
- `POST /api/connected-accounts/github/connect` — initiate OAuth flow
- `GET /api/connected-accounts/github/callback` — OAuth callback, store token
- `DELETE /api/connected-accounts/github` — disconnect
- `GET /api/internal/connected-accounts/github/credentials?tenantId=X` — sidecar fetches token for agent use (internal, authenticated)

**3. Platform-ui-core: Settings → Connected Accounts**
- New settings tab/section
- "Connect GitHub" button → OAuth popup
- Shows connected username, scopes, connected date
- Disconnect button

**4. Sidecar adapter: inject credentials at heartbeat time**
In `adapter-utils/server-utils.ts` or per-adapter execute:
```typescript
// Before spawning agent, fetch GitHub creds from platform API
const githubCreds = await fetchGitHubCredentials(tenantId);
if (githubCreds) {
  mergedEnv.GITHUB_TOKEN = githubCreds.accessToken;
  mergedEnv.GIT_AUTHOR_NAME = githubCreds.username;
  mergedEnv.GIT_AUTHOR_EMAIL = githubCreds.email;
  mergedEnv.GIT_COMMITTER_NAME = githubCreds.username;
  mergedEnv.GIT_COMMITTER_EMAIL = githubCreds.email;
}
```

**5. No Docker changes needed.** Token is ephemeral, per-process, env-only.

### OAuth Scopes Needed
- `repo` — full access to private repos
- `read:user` — read user profile (name, email)
- `user:email` — read email addresses

### Security
- Access token encrypted at rest via platform secrets service
- Token injected per-process, not written to disk
- Token only available during agent execution window
- Refresh token rotation when supported
- User can revoke at any time via UI
