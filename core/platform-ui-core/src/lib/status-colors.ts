/**
 * Centralized status color mappings for consistent styling across the app.
 * Uses emerald for active/healthy, zinc for stopped, yellow for degraded,
 * red for error/unhealthy.
 */

import type { HealthStatus, InstanceStatus } from "@/lib/api";

/** Badge className strings for bot instance statuses. */
export const INSTANCE_STATUS_STYLES: Record<InstanceStatus, string> = {
  running: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
  stopped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  degraded: "bg-yellow-500/15 text-yellow-500 border-yellow-500/25",
  error: "bg-red-500/15 text-red-500 border-red-500/25",
};

/** Badge className strings for fleet health statuses. */
export const HEALTH_STATUS_STYLES: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
  degraded: "bg-yellow-500/15 text-yellow-500 border-yellow-500/25",
  unhealthy: "bg-red-500/15 text-red-500 border-red-500/25",
};

/** Dot indicator className strings for fleet health statuses. */
export const HEALTH_DOT_STYLES: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-yellow-500",
  unhealthy: "bg-red-500",
};

/** Badge className strings for installed plugin statuses. */
export const PLUGIN_STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
  disabled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
};

/** Fallback style for unknown status values. */
export const DEFAULT_STATUS_STYLE = "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";
