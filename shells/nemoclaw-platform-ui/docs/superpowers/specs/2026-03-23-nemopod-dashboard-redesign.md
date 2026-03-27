# NemoPod Dashboard Redesign — Tab-Based Chat + Hot Pool

**Date:** 2026-03-23
**Status:** Draft

## Problem

The current dashboard is a fleet manager (card grid of instances) borrowed from the multi-tenant WOPR platform. For NemoPod as a single-tenant product:

- Users land on an empty grid and have to figure out how to create an instance
- Instance cards link to `name.nemopod.com` which returns `{"error":"Not found"}` (container has no web UI)
- Chat is disconnected from the dashboard — exists as a widget but isn't the primary experience
- Creating an instance takes ~2 minutes (cold gateway startup), killing first-run experience

## Design

### Core Concept

**The app IS the chat.** No cards, no fleet grid, no instance management page. After login, you see chat tabs — one per NemoClaw. Everything else (billing, settings) is in the sidebar.

### User Flow

```
Signup → "Name your first NemoClaw" (single input)
       → Claim from hot pool (instant)
       → Land on chat tab, ready to talk

Returning user → Land on last-active chat tab
              → Switch tabs to talk to different NemoClaws
              → Click [+] tab to add another
```

### Frontend Architecture

#### Tab Bar

Horizontal tab bar above the chat area:

```
[my-bot *] [testa] [+]
```

- Each tab shows the instance name
- Active tab is highlighted
- Health indicator: green dot (running), red dot (error), gray dot (stopped)
- `[+]` tab is always last — opens inline name input
- Tabs persist across sessions (last-active tab remembered via localStorage)

#### Views

**1. First-run (no instances)**

Single centered input: "Name your first NemoClaw"

- Subdomain preview below input as user types: `my-bot.nemopod.com`
- Enter to create — claims from hot pool instantly
- Same validation as current `AddNemoClawCard` (RFC 1123 subdomain rules)

**2. Chat (primary view)**

Full-height chat interface per tab:

- Message input at bottom
- Streaming responses via SSE proxy (`GET /api/chat/stream` + `POST /api/chat`)
- Each tab sends `instanceId` with messages so backend routes to the correct container
- Session ID per tab (tied to instance)
- Conversation history maintained server-side (existing 20-message window)

**3. Tab management**

- Click `[+]` → inline name input appears in tab bar or as a modal
- Enter creates → new tab opens with chat ready
- No delete from tab bar (instance lifecycle managed in Settings if needed)

#### Sidebar (Simplified)

```
NemoPod (logo/brand)
─────────────────
Billing        $5.00
Settings
─────────────────
[User menu]
```

- No "NemoClaws" nav item — tabs ARE the NemoClaw management
- Credit balance shown inline on Billing link
- Settings covers profile, API keys, account

#### Components to Remove

- `nemoclaw-dashboard.tsx` — replaced by tab-based chat
- `nemoclaw-card.tsx` — no more cards
- `add-nemoclaw-card.tsx` — replaced by `[+]` tab and first-run input
- `/instances` route — no longer needed

#### Components to Create

- `chat-tabs.tsx` — tab bar with instance switching
- `chat-view.tsx` — full chat interface with SSE connection management, message state, and streaming display. Built from scratch (no existing `use-chat` hook in platform-ui-core — the current hook only exists in the nemoclaw-platform-ui repo as a thin wrapper). Core responsibilities: open SSE stream per instance, send messages with `instanceId`, parse streaming deltas, manage message list state.
- `use-chat.ts` — React hook extracted from chat-view. Manages SSE connection lifecycle (connect/disconnect on tab switch), message send/receive, and reconnection on error.
- `first-run.tsx` — "Name your first NemoClaw" screen
- `(dashboard)/page.tsx` — root dashboard route, renders first-run or chat-tabs

#### Chat → Instance Routing

The current chat route resolves gateway key by tenant ID and sends all chat to `localhost:PORT/v1/chat/completions`. With multiple instances per user, the frontend must specify which instance to talk to.

**Frontend:** `POST /api/chat` body adds `instanceId`:
```json
{ "sessionId": "...", "message": "hello", "instanceId": "5af1ffd2-..." }
```

**Backend:** Chat route uses `instanceId` to look up the fleet profile, resolve that instance's gateway key, and proxy to the correct container's inference endpoint (not localhost — the container's internal Docker network URL).

### Backend — Hot Pool

#### Database Schema

```sql
CREATE TABLE pool_config (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single-row table
  pool_size  INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pool_config (pool_size) VALUES (2)
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE pool_instances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id  VARCHAR(128) NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'warm',  -- 'warm' | 'claimed' | 'dead'
  tenant_id     VARCHAR(128),       -- null when warm
  name          VARCHAR(63),        -- null when warm, becomes subdomain on claim
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at    TIMESTAMPTZ,
  CONSTRAINT valid_status CHECK (status IN ('warm', 'claimed', 'dead'))
);

CREATE INDEX idx_pool_instances_status ON pool_instances (status);
```

- `pool_config` is a single-row table enforced by `CHECK (id = 1)`.
- `pool_instances.status` includes `'dead'` for containers that failed health checks — these rows are excluded from warm counts and periodically cleaned up.

#### Pool Manager

Background service in nemoclaw-platform:

- **On startup:** Count warm instances. If below `pool_size`, cold-start containers to fill.
- **On claim:** Decrement warm count. If below `pool_size`, start a replacement in background.
- **Health check:** Pool manager monitors warm instances. If one fails, mark `status='dead'`, delete the row after cleanup, and start a replacement.
- **Cleanup:** Every 5 minutes, `DELETE FROM pool_instances WHERE status = 'dead'` and remove corresponding Docker containers.
- **Image:** Always `ghcr.io/wopr-network/nemoclaw:latest` — no per-image pools.

Warm containers:
- Run the full NemoClaw image (sidecar + gateway)
- Gateway starts and becomes healthy (~2 min)
- NOT provisioned — no tenant data, no gateway key
- Connected to the Docker network
- Named `wopr-pool-{uuid}` (temporary name until claimed)

#### Claim Flow

```
POST /api/fleet/claim { name: "my-bot" }

1. BEGIN TRANSACTION
2. Atomic claim:
   UPDATE pool_instances
   SET status = 'claimed', tenant_id = $tenantId, name = $name, claimed_at = NOW()
   WHERE id = (
     SELECT id FROM pool_instances
     WHERE status = 'warm'
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED
   )
   RETURNING *
3. If no rows returned → COMMIT, fall back to cold-create (existing flow)
4. COMMIT
5. Rename Docker container via Docker API: wopr-pool-{uuid} → wopr-{name}
6. Create fleet profile (existing ProfileStore) with tenant data
7. Provision container via POST /internal/provision with full payload:
   - tenantId, tenantName, gatewayUrl, apiKey (generated gateway key)
   - budgetCents: 0
   - adminUser: { id, email, name } (from authenticated session)
   Gateway is already running, so this completes in ~1-2 seconds.
8. Add proxy route (existing ProxyManager)
9. Return { id, name, subdomain: "{name}.nemopod.com" }
10. Background: call replenishPool()
```

The `FOR UPDATE SKIP LOCKED` prevents race conditions — two concurrent claims will each lock a different warm row.

Docker container rename uses `dockerode`'s `container.rename()` method (maps to `POST /containers/{id}/rename` in Docker API). This is a new call not in the existing FleetManager — added directly in the claim handler.

#### Replenish Loop

```
async function replenishPool():
  config = SELECT pool_size FROM pool_config WHERE id = 1
  warmCount = SELECT COUNT(*) FROM pool_instances WHERE status = 'warm'
  deficit = config.pool_size - warmCount

  for i in 0..deficit:
    container = create container from nemoclaw:latest
      (same Docker create as FleetManager.createInstance but WITHOUT provisioning,
       named wopr-pool-{uuid}, connected to platform network)
    INSERT INTO pool_instances (container_id, status) VALUES (container.id, 'warm')
```

Runs:
- On platform startup
- After each successful claim
- On a 60-second interval (catch crashed warm containers)

### Migration Path

1. **Phase 1 — Hot pool backend:** Add pool tables, pool manager, claim endpoint. Existing create flow still works as fallback.
2. **Phase 2 — Chat routing:** Update chat route to accept `instanceId`, resolve per-instance gateway keys and container URLs.
3. **Phase 3 — Dashboard UI:** Replace card grid with tab-based chat. First-run screen. Wire to claim endpoint.
4. **Phase 4 — Cleanup:** Remove old card components, old `/instances` route.

### Error Handling

- **Pool empty:** Fall back to cold-create. Show "Setting up your NemoClaw..." spinner in chat tab. Chat activates when healthy (poll instance health).
- **Claim fails:** Toast error, user retries via `[+]` tab.
- **Instance unhealthy:** Red dot on tab. Chat shows "Your NemoClaw is restarting..." message. Existing health monitor handles recovery.
- **Container dies in pool:** Pool manager marks `status='dead'`, cleans up Docker container, starts replacement.
- **Concurrent claims:** `FOR UPDATE SKIP LOCKED` ensures each request gets a different warm instance. No double-assignment.

### What This Does NOT Change

- Auth flow (BetterAuth, session cookies)
- Billing (Stripe checkout, credit ledger, metering)
- Tenant model (userId = tenantId, x-tenant-id headers)
- Subdomain proxy (testa.nemopod.com → container)
- Settings pages
