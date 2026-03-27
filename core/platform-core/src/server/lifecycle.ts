/**
 * Lifecycle management — background services and graceful shutdown.
 *
 * Products currently handle background tasks in their serve() callbacks.
 * This module provides a standard interface for starting and stopping
 * those tasks so bootPlatformServer can manage them uniformly.
 */

import type { PlatformContainer } from "./container.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackgroundHandles {
  intervals: ReturnType<typeof setInterval>[];
  unsubscribes: (() => void)[];
}

// ---------------------------------------------------------------------------
// startBackgroundServices
// ---------------------------------------------------------------------------

/**
 * Start background services that run after the server is listening.
 *
 * Currently a thin scaffold — the hooks exist so products can migrate their
 * background tasks (fleet updater, notification worker, caddy hydration,
 * health monitor) incrementally without changing the boot contract.
 */
export async function startBackgroundServices(container: PlatformContainer): Promise<BackgroundHandles> {
  const handles: BackgroundHandles = { intervals: [], unsubscribes: [] };

  // Caddy proxy hydration (if fleet + proxy are enabled)
  if (container.fleet?.proxy) {
    try {
      await container.fleet.proxy.start?.();
    } catch {
      // Non-fatal — proxy sync will retry on next health tick
    }
  }

  // Hot pool manager (if enabled)
  if (container.hotPool) {
    try {
      const poolHandles = await container.hotPool.start();
      handles.unsubscribes.push(poolHandles.stop);
    } catch {
      // Non-fatal — pool will be empty but claiming falls back to cold create
    }
  }

  return handles;
}

// ---------------------------------------------------------------------------
// gracefulShutdown
// ---------------------------------------------------------------------------

/**
 * Graceful shutdown: clear intervals, call unsubscribe hooks, close the
 * database connection pool.
 */
export async function gracefulShutdown(container: PlatformContainer, handles: BackgroundHandles): Promise<void> {
  for (const interval of handles.intervals) {
    clearInterval(interval);
  }
  for (const unsub of handles.unsubscribes) {
    unsub();
  }
  await container.pool.end();
}
