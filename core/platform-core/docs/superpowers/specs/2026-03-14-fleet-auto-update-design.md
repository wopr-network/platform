# Fleet Auto-Update with Rolling Waves

**Date:** 2026-03-14
**Status:** Draft
**Repos:** platform-core, paperclip, paperclip-platform, paperclip-platform-ui

## Problem

Upstream Paperclip changes land nightly via `upstream-sync.mjs`, which rebases our fork and creates a PR. After manual review and merge, `docker-managed.yml` auto-builds and pushes `ghcr.io/wopr-network/paperclip:managed`. But existing running containers never receive the update. New containers get `:managed` on first pull; old containers are stuck on whatever digest they were created with.

platform-core has `ImagePoller` and `ContainerUpdater` classes that are fully implemented and tested but **not wired into the application lifecycle**.

## Design

### Pipeline Overview

```
paperclipai/paperclip (upstream)
    | nightly 06:00 UTC
upstream-sync.mjs (rebase + hostedMode guards + changelog generation)
    | creates PR
human reviews & merges PR
    | push to master
docker-managed.yml (auto-build)
    | pushes ghcr.io/wopr-network/paperclip:managed
ImagePoller detects new digest
    | groups bots by tenant
RolloutOrchestrator executes strategy
    | per-bot update sequence
ContainerUpdater (snapshot + pull + recreate + health check + rollback)
```

### Human Gate

The only human checkpoint is **reviewing and merging the upstream sync PR**. Everything downstream is automatic.

### 1. Changelog Generation (changes to `paperclip/scripts/upstream-sync.mjs`)

After rebase and hostedMode gap scanning, the sync agent generates two changelogs:

**Internal changelog** (`changelogs/internal/YYYY-MM-DD.md`):
- Full developer-facing diff summary
- What upstream changed, what guards were added, conflicts resolved
- For PR review purposes

**User-facing changelog** (`changelogs/user-facing/YYYY-MM-DD.json`):
- Structured format: `{ version, date, sections: [{ title: "New" | "Improved" | "Fixed", items: string[] }] }`
- Filtered through hosted-mode exclusion list — silently drops anything related to: adapters, model selection, thinking effort, runtime/heartbeat config, provider API keys, CLI, deployment modes, infrastructure, self-hosting
- Same `HOSTED_MODE_CONTEXT` that drives the guard scanner drives the changelog filter

Both files are committed in the sync PR. The user-facing JSON is copied into the Docker image during build (add `COPY changelogs/user-facing/ /app/changelogs/` to `Dockerfile.managed`). If the image exists, its changelog exists.

**Changelog retrieval:** After pulling a new image (before starting the update sequence), extract the changelog:

```bash
docker run --rm ghcr.io/wopr-network/paperclip:managed cat /app/changelogs/latest.json
```

The extracted JSON is stored in the fleet event payload for email and UI consumption. The `latest.json` symlink always points to the most recent changelog file.

### 2. Image Detection (wire existing code in `platform-core`)

Changes to `src/fleet/services.ts`:

- Add `ImagePoller` and `ContainerUpdater` singletons
- `initFleet()` starts the poller and wires `poller.onUpdateAvailable` to `RolloutOrchestrator`
- ImagePoller already handles poll intervals per release channel (canary=5m, staging=15m, stable=30m)

### 3. Rollout Orchestrator (new: `src/fleet/rollout-orchestrator.ts`)

GoF Strategy pattern. The orchestrator is the context; strategies are interchangeable.

**`IRolloutStrategy` interface:**

```typescript
interface IRolloutStrategy {
  /** Select next batch from remaining bots */
  nextBatch(remaining: BotProfile[]): BotProfile[];
  /** Milliseconds to wait between waves */
  pauseDuration(): number;
  /** What to do when a single bot update fails */
  onBotFailure(botId: string, error: Error, attempt: number): "abort" | "skip" | "retry";
  /** Max retries per bot before skip/abort */
  maxRetries(): number;
  /** Health check timeout per bot (ms) */
  healthCheckTimeout(): number;
}
```

**Concrete strategies:**

| Strategy | Batch | Pause | Failure | Use Case |
|----------|-------|-------|---------|----------|
| `RollingWaveStrategy` | configurable % | configurable | abort on N+ failures | Default for auto-update |
| `SingleBotStrategy` | 1 bot | N/A | report | Manual per-bot update button |
| `ImmediateStrategy` | all | 0 | skip | Emergency hotfix |

Strategy selection is **admin-controlled only** — users never see this.

**Orchestrator flow:**

```
1. Group update-eligible bots by tenant
2. For each tenant:
   a. Check tenant update mode (auto/manual)
   b. If manual: mark bots as "update available", send notification, stop
   c. If auto: check if current time is within tenant's preferred window
   d. Select strategy (from admin config)
   e. Execute waves:
      - batch = strategy.nextBatch(remaining)
      - for each bot in batch: ContainerUpdater.updateBot()
      - if any failure: strategy.onBotFailure() → abort/skip/retry
      - sleep(strategy.pauseDuration())
      - repeat until remaining is empty
3. Send notification emails with changelog
```

### 4. Update Sequence Per Bot (major rework of `ContainerUpdater`)

Nuclear rollback — image AND volumes roll back together.

**Volume Snapshot Mechanism (new: `VolumeSnapshotManager`):**

The existing `SnapshotManager` operates on filesystem paths, not Docker named volumes. A new `VolumeSnapshotManager` is needed that snapshots Docker named volumes using a temporary container:

```bash
# Snapshot a named volume to a tar archive:
docker run --rm -v <volume-name>:/source -v <backup-dir>:/backup alpine \
  tar cf /backup/<volume-name>-<timestamp>.tar -C /source .

# Restore a named volume from a tar archive:
docker run --rm -v <volume-name>:/target -v <backup-dir>:/backup alpine \
  sh -c "rm -rf /target/* && tar xf /backup/<volume-name>-<timestamp>.tar -C /target"
```

This is a new class (`src/fleet/volume-snapshot-manager.ts`), not a modification of the existing `SnapshotManager`.

**Update sequence:**

```
1. Snapshot /data and /paperclip volumes (via VolumeSnapshotManager)
2. Record previous image digest (already implemented)
3. Pull new image
4. Stop container
5. Recreate container with new image (named volumes remount automatically)
6. Start container (PAPERCLIP_MIGRATION_AUTO_APPLY=true runs Drizzle migrations on boot)
7. Health check: HTTP GET http://container:3100/health, expect {"status":"ok"}
   - Timeout: 120s (increased from current 60s to allow for Drizzle migration time)
   - Poll interval: 5s
8a. HEALTHY:
   - Delete volume snapshots
   - Emit fleet event: bot.updated
   - Record new digest
8b. UNHEALTHY:
   - Stop container
   - Restore volume snapshots from step 1 (via VolumeSnapshotManager)
   - Recreate container with OLD image (digest-pinned to prevent re-pulling new)
   - Start container
   - Verify old container is healthy
   - Emit fleet event: bot.update_failed
   - Report to orchestrator (abort/skip/retry per strategy)
```

**Health check upgrade:** Replace `node -e 'process.exit(0)'` in `createContainer()` with:

```typescript
Healthcheck: {
  // Use node+fetch instead of curl — Paperclip's base image (node:lts-trixie-slim)
  // may not have curl installed.
  Test: ["CMD-SHELL", "node -e \"fetch('http://localhost:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],
  Interval: 30_000_000_000,
  Timeout: 10_000_000_000,
  Retries: 3,
  StartPeriod: 60_000_000_000, // 60s for Drizzle migrations on boot
}
```

**Note:** `HEALTH_CHECK_TIMEOUT_MS` in `ContainerUpdater` must be increased from 60,000 to 120,000 to match the spec's 120s timeout.

### 5. Tenant Update Config

Stored per-tenant (moves to per-org when org support ships — see `2026-03-14-paperclip-org-integration-design.md`).

```typescript
interface TenantUpdateConfig {
  /** "auto" = rolling wave in preferred window; "manual" = badge + button */
  mode: "auto" | "manual";
  /** Hour of day (UTC) for auto-update window. Only used when mode=auto. */
  preferredHourUtc: number; // 0-23, default 3
}
```

Default for new tenants: `{ mode: "manual", preferredHourUtc: 3 }`.

**Repository interface** (follows the `IFooRepository` pattern used throughout platform-core):

```typescript
export interface ITenantUpdateConfigRepository {
  get(tenantId: string): Promise<TenantUpdateConfig | null>;
  upsert(tenantId: string, config: TenantUpdateConfig): Promise<void>;
  listAutoEnabled(): Promise<Array<{ tenantId: string; config: TenantUpdateConfig }>>;
}
```

`DrizzleTenantUpdateConfigRepository` implements this against a `tenant_update_configs` table with columns `(tenant_id TEXT PK, mode TEXT, preferred_hour_utc INTEGER, updated_at BIGINT)`.

**Audit logging:** All config changes (mode switch, hour change) are logged via `logger.info("Tenant update config changed", { tenantId, oldConfig, newConfig, actorUserId })`. Admin-triggered updates via the `/admin/updates` route include the actor in the log entry.

Admin panel can override per-tenant or set global defaults.

**Precedence: tenant config overrides per-bot `updatePolicy`.** The existing `BotProfile.updatePolicy` field (per-bot: `on-push`, `nightly`, `manual`, `cron:*`) is superseded by `TenantUpdateConfig` for hosted deployments. The `RolloutOrchestrator` reads tenant config, not bot-level policy. `ImagePoller.shouldAutoUpdate()` is refactored to always return `false` — the poller's only job is to detect new digests and notify the orchestrator, which makes the auto/manual decision based on tenant config.

`ImagePoller.isNightlyWindow()` (hardcoded 03:00-03:30 UTC) is superseded by the orchestrator's per-tenant `preferredHourUtc` window check. The poller's nightly logic becomes a no-op.

Per-bot `updatePolicy` is preserved in the schema for self-hosted (non-platform) deployments where there is no tenant config.

### 6. Admin Controls

Admin panel (platform-core admin routes, not user-facing):

- **Global update mode**: auto / manual / paused (pause halts all rollouts fleet-wide)
- **Strategy config**: batch %, pause duration, failure threshold
- **Default update window**: hour UTC
- **Per-tenant overrides**: mode, window
- **Manual triggers**: "roll out now" for a specific image digest
- **Rollout status dashboard**: which bots updated, which failed, which pending

### 7. User-Facing Experience

**Auto mode (tenant doesn't know or care):**
- Updates happen silently during configured window
- Email after: "Your Paperclip was updated. Here's what's new: [changelog]"
- Brief downtime during container restart (seconds)

**Manual mode:**
- Email when update available: "A new update is available for your Paperclip. [changelog]"
- In-app: badge on bot in UI indicating update available
- Click "Update" → modal shows user-facing changelog with "Update Now" / "Later" buttons
- "Update Now" triggers `SingleBotStrategy` immediately
- Email after: "Your Paperclip was updated. Here's what's new: [changelog]"

**Both modes:**
- Admin email on rollback failure
- Fleet event log for audit

### 8. Image Allowlist

`FLEET_IMAGE_ALLOWLIST` already allows `ghcr.io/wopr-network/` — covers both WOPR and Paperclip images. Future brands add their prefix.

## Files to Create/Modify

### platform-core

| File | Action | Description |
|------|--------|-------------|
| `src/fleet/rollout-orchestrator.ts` | Create | Strategy pattern orchestrator |
| `src/fleet/rollout-strategies.ts` | Create | RollingWave, SingleBot, Immediate strategies |
| `src/fleet/services.ts` | Modify | Wire ImagePoller + ContainerUpdater + RolloutOrchestrator into initFleet() |
| `src/fleet/updater.ts` | Major rework | Add volume snapshot/restore lifecycle, replace FleetManager delegation with direct Docker operations for atomic update, upgrade health check from Docker HEALTHCHECK polling to HTTP GET, increase timeout from 60s to 120s |
| `src/fleet/volume-snapshot-manager.ts` | Create | Snapshot and restore Docker named volumes using temporary alpine containers |
| `src/fleet/fleet-manager.ts` | Modify | Upgrade HEALTHCHECK in createContainer() to use node+fetch instead of node -e |
| `src/fleet/image-poller.ts` | Modify | Wire onUpdateAvailable to orchestrator instead of direct updater |
| `src/db/schema/tenant-update-config.ts` | Create | Drizzle schema for tenant update preferences |
| `src/api/routes/admin-updates.ts` | Create | Admin API for update management |
| `src/fleet/update-notifier.ts` | Create | Email notifications for updates |

### paperclip

| File | Action | Description |
|------|--------|-------------|
| `scripts/upstream-sync.mjs` | Modify | Add changelog generation step |
| `Dockerfile.managed` | Modify | COPY changelogs into image |
| `changelogs/` | Create | Directory for generated changelogs |

### paperclip-platform-ui

| File | Action | Description |
|------|--------|-------------|
| Update modal component | Create | Shows changelog, "Update Now" / "Later" |
| Bot card badge | Modify | Show "Update Available" indicator |

## Dependencies

- **Implementation work required:**
  - `ImagePoller` and `ContainerUpdater` classes exist and are tested, but have no singleton getters in `services.ts` and are not imported or wired. Docker instance injection needs to be plumbed through.
  - `ContainerUpdater` needs significant enhancement: volume snapshot/restore integration with `SnapshotManager`, HTTP-based health checks (replacing `node -e`), increased timeout from 60s to 120s for migration time.
  - `RolloutOrchestrator` and strategies are entirely new code.
  - `SnapshotManager` exists in `src/backup/` but has no integration with `ContainerUpdater`.
- **Future:** Org support (see `2026-03-14-paperclip-org-integration-design.md`) — update config moves from tenant to org level after org integration ships
- **Future:** Cron policy implementation in ImagePoller (currently stubbed)

## Risks

| Risk | Mitigation |
|------|------------|
| Bad upstream migration corrupts data | Nuclear rollback: volume snapshot restored alongside image rollback |
| Upstream pushes breaking change | Human gate at sync PR review catches this before any image is built |
| Rolling wave takes too long | ImmediateStrategy available for emergency hotfixes |
| Health check passes but app is subtly broken | `/health` endpoint queries DB, so migration failures surface. Consider adding deeper health checks later. |
| Volume snapshots consume disk | Snapshots deleted after successful update. Failed rollbacks alert admin for manual cleanup. |
