# NemoPod Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fleet card grid with tab-based chat UI backed by a hot instance pool for instant provisioning.

**Architecture:** Two repos change in parallel. Backend (nemoclaw-platform) gets pool tables, pool manager service, claim endpoint, and multi-instance chat routing. Frontend (nemoclaw-platform-ui) replaces card components with tab-based chat using existing platform-ui-core ChatProvider/ChatPanel infrastructure.

**Tech Stack:** Hono + tRPC + PostgreSQL + Dockerode (backend), Next.js 16 + React 19 + platform-ui-core ChatProvider + Tailwind v4 (frontend)

**Spec:** `docs/superpowers/specs/2026-03-23-nemopod-dashboard-redesign.md`

---

## File Map

### Backend (nemoclaw-platform)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/pool/pool-manager.ts` | Pool replenish loop, warm container lifecycle, health monitoring |
| Create | `src/pool/claim.ts` | Atomic claim transaction, container rename, provision, proxy route |
| Create | `src/trpc/routers/pool.ts` | tRPC `pool.claim` mutation, `pool.status` query |
| Modify | `src/db/index.ts` | Add pool table creation to migration sequence |
| Modify | `src/routes/chat.ts` | Accept `instanceId`, resolve per-instance gateway key + container URL |
| Modify | `src/trpc/index.ts` | Mount pool router |
| Modify | `src/index.ts` | Start pool manager on boot, wire dependencies |
| Modify | `src/config.ts` | Add `POOL_SIZE_DEFAULT` config |

### Frontend (nemoclaw-platform-ui)

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/chat-tabs.tsx` | Tab bar: instance tabs + `[+]` add tab + health dots |
| Create | `src/components/first-run.tsx` | "Name your first NemoClaw" input screen |
| Create | `src/components/nemoclaw-app.tsx` | Root component: first-run or chat-tabs, orchestrates state |
| Create | `src/__tests__/chat-tabs.test.tsx` | Tab bar rendering, switching, add flow |
| Create | `src/__tests__/first-run.test.tsx` | Name input validation, submit |
| Create | `src/__tests__/nemoclaw-app.test.tsx` | First-run vs chat routing |
| Modify | `src/app/(dashboard)/instances/page.tsx` | Render `NemoClawApp` instead of `NemoClawDashboard` |
| Modify | `src/app/layout.tsx` | Update navItems (remove "NemoClaws", homePath to "/") |
| Delete | `src/components/nemoclaw-dashboard.tsx` | Replaced by nemoclaw-app |
| Delete | `src/components/nemoclaw-card.tsx` | No more cards |
| Delete | `src/components/add-nemoclaw-card.tsx` | Replaced by first-run + tab add |

---

## Phase 1: Backend — Hot Pool

### Task 1: Pool Database Tables

**Files:**
- Modify: `/home/tsavo/nemoclaw-platform/src/db/index.ts`
- Modify: `/home/tsavo/nemoclaw-platform/src/index.ts`

- [ ] **Step 1: Add pool table creation SQL**

In `src/db/index.ts`, add a function. Uses a client checkout with explicit transaction to avoid partial state on failure:

```typescript
export async function ensurePoolTables(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS pool_config (
        id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        pool_size  INTEGER NOT NULL DEFAULT 2,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      INSERT INTO pool_config (pool_size) VALUES (2) ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pool_instances (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        container_id  VARCHAR(128) NOT NULL,
        status        VARCHAR(16) NOT NULL DEFAULT 'warm',
        tenant_id     VARCHAR(128),
        name          VARCHAR(63),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        claimed_at    TIMESTAMPTZ,
        CONSTRAINT valid_status CHECK (status IN ('warm', 'claimed', 'dead'))
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pool_instances_status ON pool_instances (status)
    `);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Wire into bootstrap**

In `src/index.ts`, after migrations run, add:

```typescript
const { ensurePoolTables } = await import("./db/index.js");
await ensurePoolTables(pool);
logger.info("Pool tables ready");
```

- [ ] **Step 3: Verify locally**

Run: `pnpm dev` — check logs for "Pool tables ready" without errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/index.ts src/index.ts
git commit -m "feat: add pool_config and pool_instances tables"
```

### Task 2: Pool Manager Service

**Files:**
- Create: `/home/tsavo/nemoclaw-platform/src/pool/pool-manager.ts`
- Modify: `/home/tsavo/nemoclaw-platform/src/config.ts`

- [ ] **Step 1: Add POOL_SIZE_DEFAULT to config**

In `src/config.ts`, add to the config schema:

```typescript
POOL_SIZE_DEFAULT: z.coerce.number().default(2),
```

- [ ] **Step 2: Create pool manager**

Create `src/pool/pool-manager.ts`:

```typescript
import type pg from "pg";
import { getConfig } from "../config.js";
import { getDocker, getFleetManager, getProfileStore } from "../fleet/services.js";
import { logger } from "../log.js";

let _pool: pg.Pool | null = null;
let _replenishTimer: ReturnType<typeof setInterval> | null = null;

export function initPoolManager(pool: pg.Pool): void {
  _pool = pool;
}

function db(): pg.Pool {
  if (!_pool) throw new Error("Pool manager not initialized");
  return _pool;
}

/** Read desired pool size from DB (falls back to config default). */
async function getPoolSize(): Promise<number> {
  try {
    const res = await db().query("SELECT pool_size FROM pool_config WHERE id = 1");
    return res.rows[0]?.pool_size ?? getConfig().POOL_SIZE_DEFAULT;
  } catch {
    return getConfig().POOL_SIZE_DEFAULT;
  }
}

/** Count warm instances in the pool. */
async function warmCount(): Promise<number> {
  const res = await db().query("SELECT COUNT(*)::int AS count FROM pool_instances WHERE status = 'warm'");
  return res.rows[0].count;
}

/** Create a single warm container (unprovisioned). */
async function createWarmContainer(): Promise<void> {
  const config = getConfig();
  const docker = getDocker();
  const id = crypto.randomUUID();
  const containerName = `wopr-pool-${id.slice(0, 8)}`;

  try {
    const container = await docker.createContainer({
      Image: config.NEMOCLAW_IMAGE,
      name: containerName,
      Env: [
        `PORT=${config.NEMOCLAW_CONTAINER_PORT}`,
        `PROVISION_SECRET=${config.PROVISION_SECRET}`,
      ],
      HostConfig: {
        ReadonlyRootfs: true,
        Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m" },
        Binds: [`nemoclaw-pool-${id.slice(0, 8)}:/data`],
        RestartPolicy: { Name: "unless-stopped" },
      },
    });

    await container.start();

    // Connect to platform network
    const network = docker.getNetwork(config.FLEET_DOCKER_NETWORK);
    await network.connect({ Container: container.id });

    await db().query(
      "INSERT INTO pool_instances (id, container_id, status) VALUES ($1, $2, 'warm')",
      [id, container.id],
    );

    logger.info(`Pool: created warm container ${containerName} (${id})`);
  } catch (err) {
    logger.error(`Pool: failed to create warm container`, { error: (err as Error).message });
  }
}

/** Replenish pool to desired size. */
export async function replenishPool(): Promise<void> {
  const desired = await getPoolSize();
  const current = await warmCount();
  const deficit = desired - current;

  if (deficit <= 0) return;

  logger.info(`Pool: replenishing ${deficit} container(s) (have ${current}, want ${desired})`);

  for (let i = 0; i < deficit; i++) {
    await createWarmContainer();
  }
}

/** Mark dead containers and clean up. */
async function cleanupDead(): Promise<void> {
  const docker = getDocker();
  const res = await db().query(
    "SELECT id, container_id FROM pool_instances WHERE status = 'warm'"
  );

  for (const row of res.rows) {
    try {
      const container = docker.getContainer(row.container_id);
      const info = await container.inspect();
      if (!info.State.Running) {
        await db().query("UPDATE pool_instances SET status = 'dead' WHERE id = $1", [row.id]);
        try { await container.remove({ force: true }); } catch { /* already gone */ }
        logger.warn(`Pool: marked dead container ${row.id}`);
      }
    } catch {
      // Container doesn't exist in Docker
      await db().query("UPDATE pool_instances SET status = 'dead' WHERE id = $1", [row.id]);
      logger.warn(`Pool: marked missing container ${row.id} as dead`);
    }
  }

  // Delete dead rows
  await db().query("DELETE FROM pool_instances WHERE status = 'dead'");
}

/** Start the pool manager background loop. */
export async function startPoolManager(pool: pg.Pool): Promise<void> {
  initPoolManager(pool);

  // Initial fill
  await cleanupDead();
  await replenishPool();

  // Periodic replenish + cleanup every 60s
  _replenishTimer = setInterval(async () => {
    try {
      await cleanupDead();
      await replenishPool();
    } catch (err) {
      logger.error("Pool manager tick failed", { error: (err as Error).message });
    }
  }, 60_000);

  logger.info("Pool manager started");
}

export function stopPoolManager(): void {
  if (_replenishTimer) {
    clearInterval(_replenishTimer);
    _replenishTimer = null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pool/pool-manager.ts src/config.ts
git commit -m "feat: pool manager service with warm container lifecycle"
```

### Task 3: Claim Endpoint

**Files:**
- Create: `/home/tsavo/nemoclaw-platform/src/pool/claim.ts`
- Create: `/home/tsavo/nemoclaw-platform/src/trpc/routers/pool.ts`
- Modify: `/home/tsavo/nemoclaw-platform/src/trpc/index.ts`

- [ ] **Step 1: Create claim logic**

Create `src/pool/claim.ts`:

```typescript
import type pg from "pg";
import type { TRPCContext } from "@wopr-network/platform-core/trpc";
import { getConfig } from "../config.js";
import { getDocker, getProfileStore } from "../fleet/services.js";
import { logger } from "../log.js";
import { registerRoute } from "../proxy/fleet-resolver.js";
import { replenishPool } from "./pool-manager.js";

export interface ClaimResult {
  id: string;
  name: string;
  subdomain: string;
}

export async function claimInstance(
  pool: pg.Pool,
  name: string,
  tenantId: string,
  adminUser: { id: string; email: string; name: string },
): Promise<ClaimResult | null> {
  const config = getConfig();

  // Atomic claim with SKIP LOCKED
  const result = await pool.query(
    `UPDATE pool_instances
     SET status = 'claimed', tenant_id = $1, name = $2, claimed_at = NOW()
     WHERE id = (
       SELECT id FROM pool_instances
       WHERE status = 'warm'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [tenantId, name],
  );

  if (result.rows.length === 0) return null; // Pool empty

  const row = result.rows[0];
  const docker = getDocker();

  // Post-claim steps wrapped in try/catch — rollback DB on failure
  try {
    // Rename container
    const container = docker.getContainer(row.container_id);
    await container.rename({ name: `wopr-${name}` });

    // Generate gateway key
    const gatewayKey = crypto.randomUUID();

    // Create fleet profile
    const store = getProfileStore();
    await store.save({
      id: row.id,
      name,
      tenantId,
      image: config.NEMOCLAW_IMAGE,
      description: "",
      env: {
        NEMOCLAW_GATEWAY_KEY: gatewayKey,
      },
    });

    // Provision container (gateway already running — fast)
    try {
      const { provisionContainer } = await import("@wopr-network/provision-client");
      await provisionContainer(`http://wopr-${name}:${config.NEMOCLAW_CONTAINER_PORT}`, config.PROVISION_SECRET, {
        tenantId,
        tenantName: name,
        gatewayUrl: config.GATEWAY_URL,
        apiKey: gatewayKey,
        budgetCents: 0,
        adminUser,
      });
    } catch (err) {
      logger.warn(`Claim: provision failed for ${name}, will retry via health monitor`, {
        error: (err as Error).message,
      });
    }

    // Register proxy route
    await registerRoute(row.id, name, `wopr-${name}`, config.NEMOCLAW_CONTAINER_PORT);
  } catch (err) {
    // Rollback: mark the claimed row as dead so pool manager cleans it up
    logger.error(`Claim post-commit failed for ${row.id}, rolling back`, { error: (err as Error).message });
    await pool.query("UPDATE pool_instances SET status = 'dead' WHERE id = $1", [row.id]);
    return null;
  }

  // Replenish in background
  replenishPool().catch((err) => {
    logger.error("Pool replenish after claim failed", { error: (err as Error).message });
  });

  logger.info(`Claimed pool instance ${row.id} as "${name}" for tenant ${tenantId}`);

  return {
    id: row.id,
    name,
    subdomain: `${name}.${config.PLATFORM_DOMAIN}`,
  };
}
```

- [ ] **Step 2: Create tRPC pool router**

Create `src/trpc/routers/pool.ts`:

```typescript
import { protectedProcedure, router } from "@wopr-network/platform-core/trpc";
import { z } from "zod";
import { getConfig } from "../../config.js";
import { logger } from "../../log.js";

let _pool: import("pg").Pool | null = null;

export function setPoolRouterDeps(pool: import("pg").Pool): void {
  _pool = pool;
}

export const poolRouter = router({
  claim: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!_pool) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pool not initialized" });

      const { claimInstance } = await import("../../pool/claim.js");
      const tenantId = ctx.tenantId ?? ctx.user.id;
      const userName = ("name" in ctx.user ? (ctx.user.name as string) : undefined) ?? "User";
      const userEmail = ("email" in ctx.user ? (ctx.user.email as string) : undefined) ?? "";

      const result = await claimInstance(_pool, input.name, tenantId, {
        id: ctx.user.id,
        email: userEmail,
        name: userName,
      });

      if (result) return result;

      // Pool empty — fall back to cold-create via existing fleet router logic
      logger.info("Pool empty, falling back to cold-create");
      return { id: "", name: input.name, subdomain: `${input.name}.${getConfig().PLATFORM_DOMAIN}`, coldCreate: true };
      // Frontend checks `coldCreate` flag and calls fleet.createInstance as fallback
    }),
});
```

- [ ] **Step 3: Mount pool router**

In `src/trpc/index.ts`, add:

```typescript
import { poolRouter } from "./routers/pool.js";

// In the appRouter merge:
pool: poolRouter,
```

- [ ] **Step 4: Wire pool deps in index.ts**

In `src/index.ts`, after pool tables are created:

```typescript
const { startPoolManager, stopPoolManager } = await import("./pool/pool-manager.js");
await startPoolManager(pool);

const { setPoolRouterDeps } = await import("./trpc/routers/pool.js");
setPoolRouterDeps(pool);
```

Also add `stopPoolManager()` to the existing shutdown handler (find the SIGTERM/SIGINT handler in `src/index.ts`):

```typescript
// In the shutdown handler, add:
stopPoolManager();
```

- [ ] **Step 5: Commit**

```bash
git add src/pool/ src/trpc/routers/pool.ts src/trpc/index.ts src/index.ts
git commit -m "feat: pool claim endpoint with atomic SKIP LOCKED"
```

### Task 4: Multi-Instance Chat Routing

**Files:**
- Modify: `/home/tsavo/nemoclaw-platform/src/routes/chat.ts`

- [ ] **Step 1: Replace resolveGatewayKey with resolveInstanceChat**

Delete the existing `resolveGatewayKey` function (lines 46-55) entirely. Replace it with:

```typescript
/**
 * Resolve the gateway key and container URL for a specific instance.
 */
async function resolveInstanceChat(instanceId: string): Promise<{ gatewayKey: string; containerUrl: string } | null> {
  try {
    const { getProfileStore } = await import("../fleet/services.js");
    const { getConfig } = await import("../config.js");
    const config = getConfig();
    const profiles = await getProfileStore().list();
    const profile = profiles.find((p) => p.id === instanceId);
    if (!profile) return null;
    const gatewayKey = profile.env?.NEMOCLAW_GATEWAY_KEY;
    if (!gatewayKey) return null;
    return {
      gatewayKey,
      containerUrl: `http://wopr-${profile.name}:${config.NEMOCLAW_CONTAINER_PORT}`,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Update POST handler to use instanceId**

In the POST `/` handler, change the body schema and gateway resolution:

```typescript
const body = await c.req.json<{ sessionId: string; message: string; instanceId?: string }>();
const { sessionId, message, instanceId } = body;

if (!sessionId || !message) {
  return c.json({ error: "Missing sessionId or message" }, 400);
}
```

Replace the `tenantId` + `resolveGatewayKey` block with:

```typescript
// Resolve instance — prefer instanceId, fallback to tenant's first instance
let chatTarget: { gatewayKey: string; containerUrl: string } | null = null;

if (instanceId) {
  chatTarget = await resolveInstanceChat(instanceId);
} else {
  // Legacy fallback: find first instance for tenant
  const tenantId = c.req.header("x-tenant-id") ?? user.id;
  const { getProfileStore } = await import("../fleet/services.js");
  const profiles = await getProfileStore().list();
  const profile = profiles.find((p) => p.tenantId === tenantId);
  if (profile) chatTarget = await resolveInstanceChat(profile.id);
}

if (!chatTarget) {
  writer.write("message", JSON.stringify({ type: "error", message: "No NemoClaw instance found. Create one first." }));
  return c.json({ ok: true });
}
```

Replace the gateway URL construction (line 143) with:

```typescript
const gatewayUrl = `${chatTarget.containerUrl}/v1/chat/completions`;
```

And the Authorization header with:

```typescript
Authorization: `Bearer ${chatTarget.gatewayKey}`,
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/chat.ts
git commit -m "feat: multi-instance chat routing via instanceId"
```

---

## Phase 2: Frontend — Tab-Based Chat

### Task 5: First-Run Component

**Files:**
- Create: `/home/tsavo/nemoclaw-platform-ui/src/components/first-run.tsx`
- Create: `/home/tsavo/nemoclaw-platform-ui/src/__tests__/first-run.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/first-run.test.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@core/lib/brand-config", () => ({
  getBrandConfig: () => ({ domain: "nemopod.com" }),
}));

import { FirstRun } from "@/components/first-run";

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("FirstRun", () => {
  it("renders name input with prompt", () => {
    renderWith(<FirstRun onClaim={vi.fn()} claiming={false} />);
    expect(screen.getByPlaceholderText(/name your first nemoclaw/i)).toBeInTheDocument();
  });

  it("shows subdomain preview as user types", async () => {
    const user = userEvent.setup();
    renderWith(<FirstRun onClaim={vi.fn()} claiming={false} />);
    await user.type(screen.getByPlaceholderText(/name your first nemoclaw/i), "my-bot");
    expect(screen.getByText(/my-bot\.nemopod\.com/)).toBeInTheDocument();
  });

  it("calls onClaim with sanitized name on Enter", async () => {
    const onClaim = vi.fn();
    const user = userEvent.setup();
    renderWith(<FirstRun onClaim={onClaim} claiming={false} />);
    await user.type(screen.getByPlaceholderText(/name your first nemoclaw/i), "My Bot{Enter}");
    expect(onClaim).toHaveBeenCalledWith("my-bot");
  });

  it("shows validation error for empty input", async () => {
    const user = userEvent.setup();
    renderWith(<FirstRun onClaim={vi.fn()} claiming={false} />);
    await user.type(screen.getByPlaceholderText(/name your first nemoclaw/i), "{Enter}");
    expect(screen.getByText(/at least one letter/i)).toBeInTheDocument();
  });

  it("shows spinner when claiming", () => {
    renderWith(<FirstRun onClaim={vi.fn()} claiming={true} />);
    expect(screen.getByText(/creating/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/first-run.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement FirstRun**

Create `src/components/first-run.tsx`:

```typescript
"use client";

import { getBrandConfig } from "@core/lib/brand-config";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";

const VALID_SUBDOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function sanitize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

export function FirstRun({
  onClaim,
  claiming,
}: {
  onClaim: (name: string) => void;
  claiming: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const brand = getBrandConfig();
  const label = sanitize(name);

  function handleSubmit() {
    if (!label) {
      setError("Name must contain at least one letter or number");
      return;
    }
    if (!VALID_SUBDOMAIN.test(label)) {
      setError("Invalid name for subdomain");
      return;
    }
    setError("");
    onClaim(label);
  }

  if (claiming) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="size-8 animate-spin text-amber-400" />
        <p className="font-mono text-sm text-muted-foreground/60">Creating your NemoClaw...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Name your first NemoClaw</h1>
        <p className="font-mono text-xs text-muted-foreground/50 mt-2">
          This becomes your subdomain
        </p>
      </div>
      <div className="w-full max-w-md">
        <input
          ref={inputRef}
          type="text"
          placeholder="Name your first NemoClaw"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
          className="w-full bg-transparent border-b-2 border-border/30 pb-3 text-center text-xl font-mono outline-none focus:border-amber-400/60 transition-colors placeholder:text-muted-foreground/30"
          autoFocus
        />
        {error && <p className="mt-2 text-center font-mono text-xs text-red-400/80">{error}</p>}
        {label && !error && (
          <p className="mt-2 text-center font-mono text-xs text-amber-400/40">
            {label}.{brand.domain}
          </p>
        )}
        <p className="mt-4 text-center font-mono text-[10px] text-muted-foreground/30 tracking-wide">
          PRESS ENTER TO CREATE
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/first-run.test.tsx`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/first-run.tsx src/__tests__/first-run.test.tsx
git commit -m "feat: first-run component — name your first NemoClaw"
```

### Task 6: Chat Tabs Component

**Files:**
- Create: `/home/tsavo/nemoclaw-platform-ui/src/components/chat-tabs.tsx`
- Create: `/home/tsavo/nemoclaw-platform-ui/src/__tests__/chat-tabs.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/chat-tabs.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@core/lib/brand-config", () => ({
  getBrandConfig: () => ({ domain: "nemopod.com" }),
}));

import { ChatTabBar } from "@/components/chat-tabs";

const instances = [
  { id: "1", name: "my-bot", status: "running" as const },
  { id: "2", name: "testa", status: "stopped" as const },
];

describe("ChatTabBar", () => {
  it("renders a tab for each instance", () => {
    render(<ChatTabBar instances={instances} activeId="1" onSelect={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText("my-bot")).toBeInTheDocument();
    expect(screen.getByText("testa")).toBeInTheDocument();
  });

  it("highlights the active tab", () => {
    render(<ChatTabBar instances={instances} activeId="1" onSelect={vi.fn()} onAdd={vi.fn()} />);
    const activeTab = screen.getByText("my-bot").closest("button");
    expect(activeTab?.className).toMatch(/border-amber/);
  });

  it("calls onSelect when clicking a tab", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ChatTabBar instances={instances} activeId="1" onSelect={onSelect} onAdd={vi.fn()} />);
    await user.click(screen.getByText("testa"));
    expect(onSelect).toHaveBeenCalledWith("2");
  });

  it("renders + button", () => {
    render(<ChatTabBar instances={instances} activeId="1" onSelect={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByLabelText(/add nemoclaw/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/chat-tabs.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ChatTabBar**

Create `src/components/chat-tabs.tsx`:

```typescript
"use client";

import { cn } from "@core/lib/utils";
import { Plus } from "lucide-react";

export interface TabInstance {
  id: string;
  name: string;
  status: "running" | "stopped" | "error";
}

const statusDot = {
  running: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
  stopped: "bg-zinc-500",
  error: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]",
} as const;

export function ChatTabBar({
  instances,
  activeId,
  onSelect,
  onAdd,
}: {
  instances: TabInstance[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border/30 px-2 overflow-x-auto">
      {instances.map((inst) => (
        <button
          key={inst.id}
          type="button"
          onClick={() => onSelect(inst.id)}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-mono whitespace-nowrap transition-colors border-b-2",
            inst.id === activeId
              ? "border-amber-400 text-foreground"
              : "border-transparent text-muted-foreground/60 hover:text-muted-foreground hover:border-border/50",
          )}
        >
          <span className={cn("size-2 rounded-full flex-shrink-0", statusDot[inst.status])} />
          {inst.name}
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add NemoClaw"
        className="flex items-center justify-center size-8 ml-1 rounded text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/chat-tabs.test.tsx`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-tabs.tsx src/__tests__/chat-tabs.test.tsx
git commit -m "feat: chat tab bar with health indicators"
```

### Task 7: NemoClawApp — Root Orchestrator

**Files:**
- Create: `/home/tsavo/nemoclaw-platform-ui/src/components/nemoclaw-app.tsx`
- Create: `/home/tsavo/nemoclaw-platform-ui/src/__tests__/nemoclaw-app.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/__tests__/nemoclaw-app.test.tsx`:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("@core/lib/trpc", () => ({
  trpc: {
    fleet: {
      listInstances: { useQuery: (...args: unknown[]) => mockUseQuery(...args) },
    },
    pool: {
      claim: { useMutation: (...args: unknown[]) => mockUseMutation(...args) },
    },
  },
}));

vi.mock("@core/lib/brand-config", () => ({
  getBrandConfig: () => ({ domain: "nemopod.com", productName: "NemoClaw" }),
  productName: () => "NemoClaw",
}));

vi.mock("@core/lib/api", () => ({ mapBotState: (s: string) => s, apiFetch: vi.fn() }));
vi.mock("@core/lib/errors", () => ({ toUserMessage: (_: unknown, f: string) => f }));

import { NemoClawApp } from "@/components/nemoclaw-app";

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("NemoClawApp", () => {
  it("shows first-run when no instances", () => {
    mockUseQuery.mockReturnValue({ data: { bots: [] }, isLoading: false, error: null, refetch: vi.fn() });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    renderWith(<NemoClawApp />);
    expect(screen.getByPlaceholderText(/name your first nemoclaw/i)).toBeInTheDocument();
  });

  it("shows tabs when instances exist", () => {
    mockUseQuery.mockReturnValue({
      data: { bots: [{ id: "1", name: "my-bot", state: "running" }] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    renderWith(<NemoClawApp />);
    expect(screen.getByText("my-bot")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockUseMutation.mockReturnValue({ mutate: vi.fn(), isPending: false });
    renderWith(<NemoClawApp />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/nemoclaw-app.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement NemoClawApp**

Create `src/components/nemoclaw-app.tsx`:

```typescript
"use client";

import type { BotStatusResponse } from "@core/lib/api";
import { mapBotState } from "@core/lib/api";
import { toUserMessage } from "@core/lib/errors";
import { trpc } from "@core/lib/trpc";
import { Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChatTabBar, type TabInstance } from "./chat-tabs";
import { FirstRun } from "./first-run";

export function NemoClawApp() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingName, setAddingName] = useState<string | null>(null);

  const {
    data: rawData,
    isLoading,
    error: queryError,
    refetch,
  } = trpc.fleet.listInstances.useQuery(undefined, { refetchInterval: 30_000 });

  const claimMutation = trpc.pool.claim.useMutation({
    onSuccess: (result) => {
      refetch();
      setActiveId(result.id);
      setAddingName(null);
      toast.success(`${result.name} is ready!`);
    },
    onError: (err: unknown) => {
      setAddingName(null);
      toast.error(toUserMessage(err, "Failed to create NemoClaw"));
    },
  });

  const instances: TabInstance[] = useMemo(() => {
    const bots = (rawData as { bots?: BotStatusResponse[] } | undefined)?.bots;
    if (!Array.isArray(bots)) return [];
    return bots.map((bot) => {
      const rawStatus = mapBotState(bot.state);
      const status: TabInstance["status"] =
        rawStatus === "running" || rawStatus === "stopped" ? rawStatus : "error";
      return { id: bot.id, name: bot.name, status };
    });
  }, [rawData]);

  // Auto-select first instance if none selected
  const effectiveActiveId = activeId ?? instances[0]?.id ?? null;

  const handleClaim = useCallback(
    (name: string) => {
      setAddingName(name);
      claimMutation.mutate({ name });
    },
    [claimMutation],
  );

  const [showAddInput, setShowAddInput] = useState(false);

  const handleAdd = useCallback(() => {
    setShowAddInput(true);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/50">
        <Loader2 className="size-5 animate-spin text-amber-400/60 mr-3" />
        <span className="font-mono text-sm tracking-wide">Loading...</span>
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="font-mono text-sm text-red-400/80">Failed to load your NemoClaws.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="font-mono text-xs text-muted-foreground/50 hover:text-amber-400 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // No instances → first-run
  if (instances.length === 0) {
    return <FirstRun onClaim={handleClaim} claiming={claimMutation.isPending} />;
  }

  const activeInstance = instances.find((i) => i.id === effectiveActiveId);

  return (
    <div className="flex flex-col h-full">
      <ChatTabBar
        instances={instances}
        activeId={effectiveActiveId ?? ""}
        onSelect={setActiveId}
        onAdd={handleAdd}
      />
      {showAddInput && (
        <div className="border-b border-border/30 px-4 py-3">
          <FirstRun
            onClaim={(name) => { handleClaim(name); setShowAddInput(false); }}
            claiming={claimMutation.isPending}
          />
        </div>
      )}
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/40">
        {activeInstance && (
          <p className="font-mono text-sm">
            Chat with <span className="text-amber-400">{activeInstance.name}</span> — coming in Phase 3
          </p>
        )}
      </div>
    </div>
  );
}
```

Note: Chat integration (Phase 3) will replace the placeholder div with the actual ChatPanel wired to the active instance's `instanceId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/nemoclaw-app.test.tsx`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/nemoclaw-app.tsx src/__tests__/nemoclaw-app.test.tsx
git commit -m "feat: NemoClawApp — first-run + tab orchestrator"
```

### Task 8: Wire Up Routes & Sidebar

**Files:**
- Modify: `/home/tsavo/nemoclaw-platform-ui/src/app/(dashboard)/instances/page.tsx`
- Modify: `/home/tsavo/nemoclaw-platform-ui/src/app/layout.tsx`

- [ ] **Step 1: Update instances page**

Replace `src/app/(dashboard)/instances/page.tsx`:

```typescript
import { NemoClawApp } from "@/components/nemoclaw-app";

export default function InstancesPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <NemoClawApp />
    </div>
  );
}
```

- [ ] **Step 2: Update navItems in layout.tsx**

In `src/app/layout.tsx`, change `setBrandConfig`:

```typescript
setBrandConfig({
  homePath: "/instances",
  navItems: [
    { label: "Billing", href: "/billing/plans" },
    { label: "Settings", href: "/settings/profile" },
  ],
});
```

- [ ] **Step 3: Run check**

Run: `npm run check`
Expected: biome + tsc pass

- [ ] **Step 4: Commit**

```bash
git add src/app/
git commit -m "feat: wire tab-based dashboard, simplify sidebar nav"
```

---

## Phase 3: Chat Integration

### Task 9: Wire ChatPanel to Active Instance

**Files:**
- Modify: `/home/tsavo/nemoclaw-platform-ui/src/components/nemoclaw-app.tsx`

This task depends on the existing `ChatPanel` and `ChatProvider` from platform-ui-core. The integration passes `instanceId` to the chat context so messages route to the correct container.

- [ ] **Step 1: Import and wire ChatPanel**

In `nemoclaw-app.tsx`, replace the placeholder div with the actual chat panel from platform-ui-core. The `ChatProvider` in the dashboard layout already wraps the content. Pass `instanceId` as a prop to the chat message sender.

Implementation details depend on how `ChatProvider` accepts instance context — inspect `platform-ui-core/src/lib/chat/chat-context.tsx` for the exact API. The key change is ensuring `sendChatMessage()` includes `instanceId` in the POST body.

- [ ] **Step 2: Test chat end-to-end locally**

1. Start backend: `cd ~/nemoclaw-platform && pnpm dev`
2. Start frontend: `cd ~/nemoclaw-platform-ui && pnpm dev`
3. Login, create a NemoClaw via first-run
4. Verify chat messages route correctly

- [ ] **Step 3: Commit**

```bash
git add src/components/nemoclaw-app.tsx
git commit -m "feat: wire chat panel to active instance tab"
```

---

## Phase 4: Cleanup

### Task 10: Remove Old Components

**Files:**
- Delete: `/home/tsavo/nemoclaw-platform-ui/src/components/nemoclaw-dashboard.tsx`
- Delete: `/home/tsavo/nemoclaw-platform-ui/src/components/nemoclaw-card.tsx`
- Delete: `/home/tsavo/nemoclaw-platform-ui/src/components/add-nemoclaw-card.tsx`
- Delete: `/home/tsavo/nemoclaw-platform-ui/src/__tests__/nemoclaw-dashboard.test.tsx`
- Delete: `/home/tsavo/nemoclaw-platform-ui/src/__tests__/nemoclaw-card.test.tsx`
- Delete: `/home/tsavo/nemoclaw-platform-ui/src/__tests__/add-nemoclaw-card.test.tsx`
- Delete: `/home/tsavo/nemoclaw-platform-ui/src/__tests__/budget-section.test.tsx`

- [ ] **Step 1: Delete old files**

```bash
rm src/components/nemoclaw-dashboard.tsx src/components/nemoclaw-card.tsx src/components/add-nemoclaw-card.tsx
rm src/__tests__/nemoclaw-dashboard.test.tsx src/__tests__/nemoclaw-card.test.tsx src/__tests__/add-nemoclaw-card.test.tsx src/__tests__/budget-section.test.tsx
```

- [ ] **Step 2: Run check to ensure no broken imports**

Run: `npm run check`
Expected: pass — no remaining imports of deleted files

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all remaining tests pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old card-based dashboard components"
```

---

## Deploy Sequence

1. Deploy backend (nemoclaw-platform) with pool tables + claim endpoint + chat routing
2. Verify pool manager starts and creates warm containers on VPS
3. Deploy frontend (nemoclaw-platform-ui) with tab-based dashboard
4. E2E test: signup → name → instant claim → chat → billing
