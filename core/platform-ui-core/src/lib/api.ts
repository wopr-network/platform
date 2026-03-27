import { API_BASE_URL, PLATFORM_BASE_URL } from "./api-config";
import { envKey, getBrandConfig } from "./brand-config";
import { ApiError } from "./errors";
import { handleUnauthorized } from "./fetch-utils";
import { logger } from "./logger";
import type { ApiPricingResponse, DividendStats } from "./pricing-data";
import { getActiveTenantId } from "./tenant-context";
import { trpcVanilla } from "./trpc";

const log = logger("api");

export { ApiError, NetworkError, toUserMessage, ValidationError } from "./errors";
export { UnauthorizedError } from "./fetch-utils";

// --- Public pricing API (no auth required) ---

/**
 * Fetch live pricing rates from the backend.
 * Returns null if the fetch fails (caller should fall back to static data).
 * Uses ISR (revalidate: 60) so the pricing route can be statically rendered
 * at build time — avoids Dynamic Server usage that blocks e2e webServer startup.
 */
export async function fetchPublicPricing(): Promise<ApiPricingResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/pricing`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiPricingResponse;
  } catch (e) {
    log.warn("Failed to fetch pricing data", e);
    return null;
  }
}

/**
 * Fetch live community dividend pool stats.
 * Returns null if the endpoint is unavailable (caller should fall back to static projections).
 */
export async function fetchDividendStats(): Promise<DividendStats | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/v1/billing/dividend/stats`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as DividendStats;
  } catch (e) {
    log.warn("Failed to fetch dividend stats", e);
    return null;
  }
}

export type InstanceStatus = "running" | "stopped" | "degraded" | "error";

export interface Instance {
  id: string;
  name: string;
  status: InstanceStatus;
  provider: string;
  channels: string[];
  plugins: PluginInfo[];
  uptime: number | null;
  createdAt: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

export interface ChannelInfo {
  id: string;
  name: string;
  type: string;
  status: "connected" | "disconnected" | "error";
}

export interface SessionInfo {
  id: string;
  userId: string;
  messageCount: number;
  startedAt: string;
  lastActivityAt: string;
}

export interface InstanceDetail extends Instance {
  config: Record<string, unknown>;
  channelDetails: ChannelInfo[];
  sessions: SessionInfo[];
  resourceUsage: {
    memoryMb: number;
    cpuPercent: number;
  };
}

// --- API client ---

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const tenantId = getActiveTenantId();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, res.statusText, (body as { error?: string }).error ?? undefined);
  }
  return res.json() as Promise<T>;
}

/** Like apiFetch but returns the raw Response (for streaming or status inspection). */
export async function apiFetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const tenantId = getActiveTenantId();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  return res;
}

/** Fetch against the PLATFORM_BASE_URL (not /api) — for Next.js API routes and OAuth endpoints. */
export async function platformFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const tenantId = getActiveTenantId();
  const res = await fetch(`${PLATFORM_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Like platformFetch but returns the raw Response. */
export async function platformFetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const tenantId = getActiveTenantId();
  const res = await fetch(`${PLATFORM_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  return res;
}

export async function fleetFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const tenantId = getActiveTenantId();
  const res = await fetch(`${PLATFORM_BASE_URL}/fleet${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, res.statusText, (body as { error?: string }).error ?? undefined);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// --- Instance API ---

/** Shape returned by GET /fleet/bots on the backend */
export interface BotStatusResponse {
  id: string;
  name: string;
  state: string;
  health: string | null;
  uptime: string | null;
  startedAt: string | null;
  createdAt?: string;
  env?: Record<string, string>;
  stats: {
    cpuPercent: number;
    memoryUsageMb: number;
    memoryLimitMb: number;
    memoryPercent: number;
  } | null;
  [key: string]: unknown;
}

/** Parse channel IDs from bot env vars ({PREFIX}_PLUGINS_CHANNELS is comma-separated). */
export function parseChannelsFromEnv(env: Record<string, string> | undefined): string[] {
  const raw = env?.[envKey("PLUGINS_CHANNELS")];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse plugin IDs from bot env vars ({PREFIX}_PLUGINS_OTHER, {PREFIX}_PLUGINS_VOICE, {PREFIX}_PLUGINS_PROVIDERS are comma-separated). */
export function parsePluginsFromEnv(env: Record<string, string> | undefined): PluginInfo[] {
  if (!env) return [];
  const ids = new Set<string>();
  for (const key of [
    envKey("PLUGINS_OTHER"),
    envKey("PLUGINS_VOICE"),
    envKey("PLUGINS_PROVIDERS"),
  ]) {
    const raw = env[key];
    if (raw) {
      for (const id of raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)) {
        ids.add(id);
      }
    }
  }
  return [...ids].map((id) => ({ id, name: id, version: "", enabled: true }));
}

/** Extract the LLM provider from bot env vars. */
export function getProviderFromEnv(env?: Record<string, string>): string {
  const val = env?.[envKey("LLM_PROVIDER")];
  return typeof val === "string" ? val : "";
}

export function mapBotState(state: string): InstanceStatus {
  if (state === "running") return "running";
  if (state === "error" || state === "dead") return "error";
  return "stopped";
}

export function mapBotStatusToFleetInstance(bot: BotStatusResponse): FleetInstance {
  const status = mapBotState(bot.state);

  let health: HealthStatus;
  if (bot.health === "healthy") health = "healthy";
  else if (bot.health === "unhealthy") health = "unhealthy";
  else if (bot.health === "degraded" || bot.health === "starting") health = "degraded";
  else if (status === "running") health = "healthy";
  else if (status === "stopped" || status === "error") health = "degraded";
  else health = "healthy";

  let uptime: number | null = null;
  if (bot.uptime) {
    const startedMs = new Date(bot.uptime).getTime();
    if (!Number.isNaN(startedMs)) {
      uptime = Math.floor((Date.now() - startedMs) / 1000);
    }
  }

  return {
    id: bot.id,
    name: bot.name,
    status,
    health,
    uptime,
    pluginCount: 0,
    sessionCount: 0,
    provider: "",
  };
}

export async function listInstances(): Promise<Instance[]> {
  const data = await trpcVanilla.fleet.listInstances.query(undefined);
  const raw = (data as { bots?: BotStatusResponse[] | null }).bots;
  const bots = Array.isArray(raw) ? raw : [];
  return bots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    status: mapBotState(bot.state),
    provider: getProviderFromEnv(bot.env as Record<string, string> | undefined),
    channels: parseChannelsFromEnv(bot.env),
    plugins: parsePluginsFromEnv(bot.env),
    uptime: (() => {
      const ms = bot.uptime ? new Date(bot.uptime).getTime() : NaN;
      return Number.isNaN(ms) ? null : Math.floor((Date.now() - ms) / 1000);
    })(),
    createdAt: (bot.createdAt as string | undefined) ?? new Date().toISOString(),
  }));
}

export async function getInstance(id: string): Promise<InstanceDetail> {
  const bot = (await trpcVanilla.fleet.getInstance.query({
    id,
  })) as BotStatusResponse;
  const uptimeMs = bot.uptime ? new Date(bot.uptime).getTime() : NaN;
  return {
    id: bot.id,
    name: bot.name,
    status: mapBotState(bot.state),
    provider: getProviderFromEnv(bot.env as Record<string, string> | undefined),
    channels: parseChannelsFromEnv(bot.env as Record<string, string> | undefined),
    plugins: parsePluginsFromEnv(bot.env as Record<string, string> | undefined),
    uptime: Number.isNaN(uptimeMs) ? null : Math.floor((Date.now() - uptimeMs) / 1000),
    createdAt: (bot.createdAt as string | undefined) ?? new Date().toISOString(),
    config: bot.env ?? {},
    channelDetails: [],
    sessions: [],
    resourceUsage: {
      memoryMb: bot.stats?.memoryUsageMb ?? 0,
      cpuPercent: bot.stats?.cpuPercent ?? 0,
    },
  };
}

export async function createInstance(data: {
  name: string;
  image?: string;
  template?: string;
  provider: string;
  channels: string[];
  plugins: string[];
}): Promise<Instance> {
  const result = await trpcVanilla.fleet.createInstance.mutate({
    ...data,
    image: data.image ?? "ghcr.io/wopr-network/wopr:latest",
  });
  const profile = result as Record<string, unknown>;
  return {
    id: (profile.id as string) ?? "",
    name: (profile.name as string) ?? data.name,
    status: "stopped",
    provider: data.provider,
    channels: data.channels,
    plugins: data.plugins.map((id) => ({ id, name: id, version: "", enabled: true })),
    uptime: null,
    createdAt: new Date().toISOString(),
  };
}

/** Payload for deploying a bot from onboarding. */
export interface DeployBotPayload {
  name: string;
  description?: string;
  env?: Record<string, string>;
}

/**
 * Deploy a new bot instance via tRPC fleet.createInstance.
 * Uses the default stable image from brand config. tenantId is injected server-side.
 */
export async function deployInstance(payload: DeployBotPayload): Promise<Instance> {
  const input = {
    name: payload.name,
    image: getBrandConfig().defaultImage || "ghcr.io/wopr-network/wopr:stable",
    description: payload.description ?? "",
    env: payload.env ?? {},
  };
  const result = await trpcVanilla.fleet.createInstance.mutate(input);
  const profile = result as Record<string, unknown>;
  return {
    id: (profile.id as string) ?? "",
    name: (profile.name as string) ?? payload.name,
    status: "stopped",
    provider: getProviderFromEnv(payload.env),
    channels: parseChannelsFromEnv(payload.env),
    plugins: parsePluginsFromEnv(payload.env),
    uptime: null,
    createdAt: new Date().toISOString(),
  };
}

// --- Channel QR polling API ---

export type ChannelQrStatus = "pending" | "connected" | "expired" | "no-session";

export interface ChannelQrResponse {
  qrPng: string | null;
  status: ChannelQrStatus;
}

/** Poll the platform for the current QR code state for a given bot instance. */
export async function pollChannelQr(botId: string): Promise<ChannelQrResponse> {
  const res = await fetch(`${PLATFORM_BASE_URL}/api/channels/${encodeURIComponent(botId)}/qr`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<ChannelQrResponse>;
}

// --- Channel API ---

/** Connect a channel (plugin) to a bot instance. */
export async function connectChannel(
  botId: string,
  pluginId: string,
  credentials: Record<string, string>,
): Promise<ChannelInfo> {
  return fleetFetch<ChannelInfo>(`/bots/${botId}/channels/${pluginId}`, {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

/** Test channel credentials against the provider API before connecting. */
export async function testChannelConnection(
  pluginId: string,
  credentials: Record<string, string>,
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${PLATFORM_BASE_URL}/api/channels/${pluginId}/test`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credentials }),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<{ success: boolean; error?: string }>;
}

/** List channels connected to a bot instance. */
export async function listChannels(botId: string): Promise<ChannelInfo[]> {
  return fleetFetch<ChannelInfo[]>(`/bots/${botId}/channels`);
}

export async function controlInstance(
  id: string,
  action: "start" | "stop" | "restart" | "destroy",
): Promise<void> {
  await trpcVanilla.fleet.controlInstance.mutate({ id, action });
}

/** PATCH /fleet/bots/:id — Update bot env config. */
export async function updateInstanceConfig(id: string, env: Record<string, string>): Promise<void> {
  await fleetFetch(`/bots/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ env }),
  });
}

/** PATCH /fleet/bots/:id — Rename a bot instance. */
export async function renameInstance(id: string, name: string): Promise<void> {
  await fleetFetch(`/bots/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

/** GET /fleet/bots/:id/secrets — List secret key names (no values). */
export async function getInstanceSecretKeys(id: string): Promise<string[]> {
  try {
    const data = await fleetFetch<{ keys: string[] }>(`/bots/${id}/secrets`);
    return data.keys;
  } catch (err) {
    // 404 means the endpoint doesn't exist yet on this bot — treat as empty.
    // All other errors (network failure, 500, etc.) propagate so callers can show an error.
    if (err instanceof Error && err.message.includes("404")) {
      return [];
    }
    throw err;
  }
}

/** PUT /fleet/bots/:id/secrets — Write secret values. */
export async function updateInstanceSecrets(
  id: string,
  secrets: Record<string, string>,
): Promise<void> {
  await fleetFetch(`/bots/${id}/secrets`, {
    method: "PUT",
    body: JSON.stringify({ secrets }),
  });
}

/** Toggle a plugin's enabled/disabled state on a bot instance. */
export async function toggleInstancePlugin(
  botId: string,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  await fleetFetch(`/bots/${botId}/plugins/${pluginId}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

// --- Image update API ---

export interface ImageStatusResponse {
  currentDigest: string;
  latestDigest: string;
  updateAvailable: boolean;
}

export async function getImageStatus(id: string): Promise<ImageStatusResponse | null> {
  try {
    return await fleetFetch<ImageStatusResponse>(`/bots/${id}/image-status`);
  } catch (e) {
    log.warn("Failed to fetch image status", e);
    return null;
  }
}

export async function pullImageUpdate(id: string): Promise<void> {
  await fleetFetch<unknown>(`/bots/${id}/update`, { method: "POST" });
}

// --- Observability types ---

export type HealthStatus = "healthy" | "degraded" | "unhealthy";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface PluginHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
  lastCheck: string;
}

export interface ProviderHealth {
  name: string;
  available: boolean;
  latencyMs: number | null;
}

export interface HealthHistoryEntry {
  timestamp: string;
  status: HealthStatus;
}

export interface InstanceHealth {
  status: HealthStatus;
  uptime: number;
  activeSessions: number;
  totalSessions: number;
  plugins: PluginHealth[];
  providers: ProviderHealth[];
  history: HealthHistoryEntry[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

export interface MetricsSnapshot {
  timestamp: string;
  requestCount: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  activeSessions: number;
  memoryMb: number;
}

export interface TokenUsage {
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

export interface PluginEventCount {
  plugin: string;
  count: number;
}

export interface InstanceMetrics {
  timeseries: MetricsSnapshot[];
  tokenUsage: TokenUsage[];
  pluginEvents: PluginEventCount[];
}

export interface FleetInstance {
  id: string;
  name: string;
  status: InstanceStatus;
  health: HealthStatus;
  uptime: number | null;
  pluginCount: number;
  sessionCount: number;
  provider: string;
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  targetHref: string;
}

export interface FleetResources {
  totalCpuPercent: number;
  totalMemoryMb: number;
  memoryCapacityMb: number;
}

// --- Observability API ---

export async function getInstanceHealth(id: string): Promise<InstanceHealth> {
  const data = await trpcVanilla.fleet.getInstanceHealth.query({ id });
  const res = data as {
    id: string;
    state: string;
    health: string | null;
    uptime: string | null;
    stats: { cpuPercent: number; memoryUsageMb: number } | null;
  };

  let healthStatus: HealthStatus;
  if (res.health === "healthy") healthStatus = "healthy";
  else if (res.health === "unhealthy") healthStatus = "unhealthy";
  else healthStatus = "degraded";

  let uptime = 0;
  if (res.uptime) {
    const ms = new Date(res.uptime).getTime();
    if (!Number.isNaN(ms)) {
      uptime = Math.floor((Date.now() - ms) / 1000);
    }
  }

  return {
    status: healthStatus,
    uptime,
    activeSessions: 0,
    totalSessions: 0,
    plugins: [],
    providers: [],
    history: [],
  };
}

export async function getInstanceLogs(
  id: string,
  params?: { level?: LogLevel; source?: string; search?: string },
): Promise<LogEntry[]> {
  const data = await trpcVanilla.fleet.getInstanceLogs.query({
    id,
    tail: 100,
  });
  const rawLogs = (data as { logs?: string[] | null }).logs ?? [];

  // Parse raw container log strings into structured LogEntry objects
  // Format: "2026-02-20T10:00:00Z [LEVEL] message" or plain text
  let entries: LogEntry[] = rawLogs.map((line, i) => {
    const match = line.match(/^(\S+)\s+\[(\w+)]\s+(.*)$/);
    if (match) {
      const level = match[2].toLowerCase();
      return {
        id: `log-${i}`,
        timestamp: match[1],
        level: (["debug", "info", "warn", "error"].includes(level) ? level : "info") as LogLevel,
        source: "container",
        message: match[3],
      };
    }
    return {
      id: `log-${i}`,
      timestamp: new Date().toISOString(),
      level: "info" as LogLevel,
      source: "container",
      message: line,
    };
  });

  // Apply client-side filters (server doesn't support them via tRPC)
  if (params?.level) {
    entries = entries.filter((e) => e.level === params.level);
  }
  if (params?.source) {
    entries = entries.filter((e) => e.source === params.source);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    entries = entries.filter((e) => e.message.toLowerCase().includes(q));
  }

  return entries;
}

export async function getInstanceMetrics(id: string): Promise<InstanceMetrics> {
  const data = await trpcVanilla.fleet.getInstanceMetrics.query({ id });
  const res = data as {
    id: string;
    stats: {
      cpuPercent: number;
      memoryUsageMb: number;
      memoryLimitMb: number;
      memoryPercent: number;
    } | null;
  };

  // Build a single-point timeseries from current stats
  const snapshot: MetricsSnapshot = {
    timestamp: new Date().toISOString(),
    requestCount: 0,
    latencyP50: 0,
    latencyP95: 0,
    latencyP99: 0,
    activeSessions: 0,
    memoryMb: res.stats?.memoryUsageMb ?? 0,
  };

  return {
    timeseries: [snapshot],
    tokenUsage: [],
    pluginEvents: [],
  };
}

export async function getFleetHealth(): Promise<FleetInstance[]> {
  const data = await trpcVanilla.fleet.listInstances.query(undefined);
  const raw = (data as { bots?: BotStatusResponse[] | null }).bots;
  const bots = Array.isArray(raw) ? raw : [];
  return bots.map(mapBotStatusToFleetInstance);
}

export async function getActivityFeed(): Promise<ActivityEvent[]> {
  return apiFetch<ActivityEvent[]>("/activity");
}

export async function getFleetResources(): Promise<FleetResources> {
  return apiFetch<FleetResources>("/fleet/resources");
}

// --- Settings types ---

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  oauthConnections: { provider: string; connected: boolean }[];
}

export interface ProviderKey {
  id: string;
  provider: string;
  maskedKey: string;
  status: "valid" | "invalid" | "unchecked";
  lastChecked: string | null;
  defaultModel: string | null;
  models: string[];
}

export interface PlatformApiKey {
  id: string;
  name: string;
  prefix: string;
  scope: "read-only" | "full" | "instances";
  instanceIds?: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface OrgMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: "admin" | "member";
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  billingEmail: string;
  members: OrgMember[];
  invites: OrgInvite[];
}

// --- Settings API ---

export async function getProfile(): Promise<UserProfile> {
  // NOTE: add tRPC procedure
  return apiFetch<UserProfile>("/settings/profile");
}

export async function updateProfile(
  data: Partial<Pick<UserProfile, "name" | "email">>,
): Promise<UserProfile> {
  // NOTE: add tRPC procedure
  return apiFetch<UserProfile>("/settings/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function uploadAvatar(file: File): Promise<UserProfile> {
  const tenantId = getActiveTenantId();
  const form = new FormData();
  form.append("avatar", file);
  const res = await fetch(`${API_BASE_URL}/settings/profile/avatar`, {
    method: "POST",
    credentials: "include",
    headers: {
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    },
    body: form,
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, res.statusText, (body as { error?: string }).error ?? undefined);
  }
  return res.json() as Promise<UserProfile>;
}

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  // NOTE: add tRPC procedure
  await apiFetch("/settings/profile/password", { method: "POST", body: JSON.stringify(data) });
}

export async function deleteAccount(): Promise<void> {
  // NOTE: add tRPC procedure
  await apiFetch("/settings/profile", { method: "DELETE" });
}

export async function listProviderKeys(): Promise<ProviderKey[]> {
  // NOTE: add tRPC procedure
  return apiFetch<ProviderKey[]>("/settings/providers");
}

export async function testProviderKey(id: string): Promise<{ valid: boolean }> {
  // NOTE: add tRPC procedure
  return apiFetch<{ valid: boolean }>(`/settings/providers/${id}/test`, { method: "POST" });
}

export async function removeProviderKey(id: string, provider: string): Promise<void> {
  try {
    await deleteTenantKey(provider);
  } catch {
    // tenant-key may not exist if it was never stored there -- continue
  }
  await apiFetch(`/settings/providers/${id}`, { method: "DELETE" });
}

export async function saveProviderKey(provider: string, key: string): Promise<ProviderKey> {
  await storeTenantKey(provider, key);
  return apiFetch<ProviderKey>("/settings/providers", {
    method: "POST",
    body: JSON.stringify({ provider, key }),
  });
}

export async function updateProviderModel(id: string, model: string): Promise<void> {
  // NOTE: add tRPC procedure
  await apiFetch(`/settings/providers/${id}/model`, {
    method: "PATCH",
    body: JSON.stringify({ model }),
  });
}

export async function listApiKeys(): Promise<PlatformApiKey[]> {
  // NOTE: add tRPC procedure
  return apiFetch<PlatformApiKey[]>("/settings/api-keys");
}

export async function createApiKey(data: {
  name: string;
  scope: string;
  expiration: string;
  instanceIds?: string[];
}): Promise<{ key: PlatformApiKey; secret: string }> {
  // NOTE: add tRPC procedure
  return apiFetch<{ key: PlatformApiKey; secret: string }>("/settings/api-keys", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  // NOTE: add tRPC procedure
  await apiFetch(`/settings/api-keys/${id}`, { method: "DELETE" });
}

// --- Secrets Vault types ---

/** A secret summary (value never returned after creation). */
export interface SecretSummary {
  id: string;
  name: string;
  /** e.g. "webhook-signing", "api-token", "service-credential" */
  type: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  rotatedAt: string | null;
  isActive: boolean;
}

/** An audit log entry for secret access. */
export interface SecretAuditEntry {
  id: string;
  secretId: string;
  action: "accessed" | "rotated" | "created" | "deleted";
  actorType: "plugin" | "bot" | "user";
  actorName: string;
  timestamp: string;
}

// NOTE: migrate to tRPC when secrets router is extended
/** GET /settings/secrets — List all secrets for the tenant. */
export async function listSecrets(): Promise<SecretSummary[]> {
  return apiFetch<SecretSummary[]>("/settings/secrets");
}

// NOTE: migrate to tRPC when secrets router is extended
/** POST /settings/secrets — Create a new secret. */
export async function createSecret(data: {
  name: string;
  value: string;
  type: string;
  expiresIn?: string;
}): Promise<{ secret: SecretSummary; plaintextValue: string }> {
  return apiFetch<{ secret: SecretSummary; plaintextValue: string }>("/settings/secrets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// NOTE: migrate to tRPC when secrets router is extended
/** POST /settings/secrets/:id/rotate — Rotate a secret. */
export async function rotateSecret(
  id: string,
): Promise<{ secret: SecretSummary; plaintextValue: string }> {
  return apiFetch<{ secret: SecretSummary; plaintextValue: string }>(
    `/settings/secrets/${encodeURIComponent(id)}/rotate`,
    { method: "POST" },
  );
}

// NOTE: migrate to tRPC when secrets router is extended
/** DELETE /settings/secrets/:id — Delete a secret. */
export async function deleteSecret(id: string): Promise<void> {
  await apiFetch(`/settings/secrets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// NOTE: migrate to tRPC when secrets router is extended
/** GET /settings/secrets/:id/audit — Fetch audit log for a secret. */
export async function fetchSecretAudit(id: string): Promise<SecretAuditEntry[]> {
  return apiFetch<SecretAuditEntry[]>(`/settings/secrets/${encodeURIComponent(id)}/audit`);
}

// --- Billing types ---

export interface BillingUsage {
  plan: string;
  planName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  instancesRunning: number;
  instanceCap: number;
  storageUsedGb: number;
  storageCapGb: number;
  apiCalls: number;
}

export type HostedCapability = "transcription" | "image_gen" | "text_gen" | "embeddings";

export interface HostedCapabilityUsage {
  capability: HostedCapability;
  label: string;
  units: number;
  unitLabel: string;
  cost: number;
}

export interface HostedUsageSummary {
  periodStart: string;
  periodEnd: string;
  capabilities: HostedCapabilityUsage[];
  totalCost: number;
  includedCredit: number;
  amountDue: number;
}

export interface BillingUsageSummary {
  periodStart: string;
  periodEnd: string;
  totalSpend: number;
  includedCredit: number;
  amountDue: number;
  planName: string;
}

export interface HostedUsageEvent {
  id: string;
  date: string;
  capability: HostedCapability;
  provider: string;
  units: number;
  unitLabel: string;
  cost: number;
}

export interface SpendingLimit {
  alertAt: number | null;
  hardCap: number | null;
}

export interface SpendingLimits {
  global: SpendingLimit;
  perCapability: Record<HostedCapability, SpendingLimit>;
}

export type InferenceMode = "byok" | "hosted";

export interface InvoiceLineItem {
  capability: string;
  units: number;
  unitPrice: number;
  total: number;
}

export interface ProviderCost {
  provider: string;
  estimatedCost: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageDataPoint {
  date: string;
  apiCalls: number;
  instances: number;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: "paid" | "pending" | "failed";
  downloadUrl: string;
  hostedUrl: string;
  hostedLineItems?: InvoiceLineItem[];
}

export interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

export interface BillingInfo {
  email: string;
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
}

export interface CreditOption {
  priceId: string;
  label: string;
  amountCents: number;
  creditCents: number;
  bonusPercent: number;
}

// --- Auto-topup types ---

export type AutoTopupInterval = "daily" | "weekly" | "monthly";

export interface AutoTopupSettings {
  usageBased: {
    enabled: boolean;
    thresholdCents: number;
    topupAmountCents: number;
  };
  scheduled: {
    enabled: boolean;
    amountCents: number;
    interval: AutoTopupInterval;
    nextChargeDate: string | null;
  };
  paymentMethodLast4: string | null;
  paymentMethodBrand: string | null;
}

// --- Billing API (tRPC) ---

export async function getCurrentPlan(): Promise<string> {
  const res = await trpcVanilla.billing.currentPlan.query(undefined);
  return res.tier;
}

export async function getBillingUsage(): Promise<BillingUsage> {
  // NOTE(WOP-687): align backend response shape with UI type
  const plan = await getCurrentPlan();
  return {
    plan,
    planName: plan.charAt(0).toUpperCase() + plan.slice(1),
    billingPeriodStart: new Date(Date.now() - 30 * 86400000).toISOString(),
    billingPeriodEnd: new Date().toISOString(),
    instancesRunning: 0,
    instanceCap: 1,
    storageUsedGb: 0,
    storageCapGb: 1,
    apiCalls: 0,
  };
}

export async function getProviderCosts(): Promise<ProviderCost[]> {
  return trpcVanilla.billing.providerCosts.query(undefined);
}

export async function getUsageHistory(_days?: number): Promise<UsageDataPoint[]> {
  // NOTE(WOP-687): backend usageHistory returns Stripe reports, not daily data points
  return [];
}

export async function getBillingInfo(): Promise<BillingInfo> {
  return trpcVanilla.billing.billingInfo.query(undefined);
}

export async function updateBillingEmail(email: string): Promise<void> {
  await trpcVanilla.billing.updateBillingEmail.mutate({ email });
}

export async function removePaymentMethod(id: string): Promise<void> {
  await trpcVanilla.billing.removePaymentMethod.mutate({ id });
}

export async function setDefaultPaymentMethod(id: string): Promise<void> {
  await trpcVanilla.billing.setDefaultPaymentMethod.mutate({ id });
}

export async function createSetupIntent(): Promise<{ clientSecret: string }> {
  return apiFetch<{ clientSecret: string }>("/billing/setup-intent", { method: "POST" });
}

export async function createBillingPortalSession(): Promise<{ url: string }> {
  return trpcVanilla.billing.portalSession.mutate({
    returnUrl: typeof window !== "undefined" ? window.location.href : "",
  });
}

// --- Capability settings types ---

export type CapabilityName = "transcription" | "image-gen" | "text-gen" | "embeddings";
export type CapabilityMode = "hosted" | "byok";

export interface CapabilitySetting {
  capability: CapabilityName;
  mode: CapabilityMode;
  maskedKey: string | null;
  keyStatus: "valid" | "invalid" | "unchecked" | null;
  provider: string | null;
}

export interface CapabilityMetaEntry {
  capability: string;
  label: string;
  description: string;
  pricing: string;
  hostedProvider: string;
  icon: string;
  sortOrder: number;
}

// --- Capability settings API ---

// --- Credits types ---

export interface CreditBalance {
  balance: number;
  dailyBurn: number;
  runway: number | null;
}

export type CreditTransactionType =
  | "purchase"
  | "signup_credit"
  | "bot_runtime"
  | "refund"
  | "bonus"
  | "adjustment"
  | "community_dividend";

export interface CreditTransaction {
  id: string;
  type: CreditTransactionType;
  description: string;
  amount: number;
  createdAt: string;
}

export interface CreditHistoryResponse {
  transactions: CreditTransaction[];
  nextCursor: string | null;
}

// --- Affiliate types ---

export type ReferralStatus = "pending" | "matched";

export interface AffiliateStats {
  referralCode: string;
  referralUrl: string;
  totalReferred: number;
  totalConverted: number;
  totalEarnedCents: number;
}

export type Referral =
  | { id: string; maskedEmail: string; joinedAt: string; status: "pending"; matchAmountCents: null }
  | {
      id: string;
      maskedEmail: string;
      joinedAt: string;
      status: "matched";
      matchAmountCents: number;
    };

export interface AffiliateReferralsResponse {
  referrals: Referral[];
  total: number;
}

export interface CheckoutResponse {
  checkoutUrl: string;
}

// --- Credits API (tRPC) ---

export async function getCreditBalance(): Promise<CreditBalance> {
  const res = await trpcVanilla.billing.creditsBalance.query({});
  return {
    balance: (res?.balance_credits ?? res?.balance_cents ?? 0) / 100,
    dailyBurn: (res?.daily_burn_credits ?? res?.daily_burn_cents ?? 0) / 100,
    runway: res?.runway_days ?? null,
  };
}

function mapTransactionType(backendType: string): CreditTransactionType {
  const map: Record<string, CreditTransactionType> = {
    grant: "purchase",
    refund: "refund",
    correction: "adjustment",
    community_dividend: "community_dividend",
  };
  return map[backendType] ?? "adjustment";
}

export async function getCreditHistory(_cursor?: string): Promise<CreditHistoryResponse> {
  const res = await trpcVanilla.billing.creditsHistory.query({});
  const entries = Array.isArray(res?.entries) ? res.entries : [];
  return {
    transactions: (
      entries as Array<{
        id?: string;
        type?: string;
        reason?: string;
        amount_cents?: number;
        created_at?: number;
      }>
    ).map((e) => ({
      id: e.id ?? "",
      type: mapTransactionType(e.type ?? ""),
      description: e.reason ?? "",
      amount: (e.amount_cents ?? 0) / 100,
      createdAt: e.created_at
        ? new Date(e.created_at * 1000).toISOString()
        : new Date().toISOString(),
    })),
    nextCursor: null, // NOTE(WOP-687): implement cursor-based pagination
  };
}

export async function getCreditOptions(): Promise<CreditOption[]> {
  return trpcVanilla.billing.creditOptions.query(undefined);
}

export async function createCreditCheckout(priceId: string): Promise<CheckoutResponse> {
  const res = await trpcVanilla.billing.creditsCheckout.mutate({
    priceId,
    successUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/billing/credits?checkout=success`,
    cancelUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/billing/credits?checkout=cancel`,
  });
  const url = res.url;
  if (!url) throw new Error("Portal URL unavailable");
  return { checkoutUrl: url };
}

// --- Supported payment methods (runtime-configured) ---

export interface SupportedPaymentMethod {
  id: string;
  type: string;
  token: string;
  chain: string;
  displayName: string;
  decimals: number;
  displayOrder: number;
  iconUrl: string;
}

export async function getSupportedPaymentMethods(): Promise<SupportedPaymentMethod[]> {
  return trpcVanilla.billing.supportedPaymentMethods.query(undefined);
}

// --- Unified checkout (replaces stablecoin/eth/btc-specific endpoints) ---

export interface CheckoutResult {
  depositAddress: string;
  displayAmount: string;
  amountUsd: number;
  token: string;
  chain: string;
  referenceId: string;
  priceCents?: number;
}

export async function createCheckout(methodId: string, amountUsd: number): Promise<CheckoutResult> {
  return trpcVanilla.billing.checkout.mutate({ methodId, amountUsd });
}

// --- Charge status polling ---

export interface ChargeStatusResult {
  chargeId: string;
  status: "pending" | "partial" | "confirmed" | "expired" | "failed";
  amountExpectedCents: number;
  amountReceivedCents: number;
  confirmations: number;
  confirmationsRequired: number;
  txHash?: string;
  credited: boolean;
  /** @deprecated Use amountExpectedCents. Removed next major. */
  amountUsdCents: number;
}

export async function getChargeStatus(referenceId: string): Promise<ChargeStatusResult> {
  return trpcVanilla.billing.chargeStatus.query({ referenceId });
}

// --- Admin payment method management ---

export interface PaymentMethodAdmin {
  id: string;
  type: string;
  token: string;
  chain: string;
  contractAddress: string | null;
  decimals: number;
  displayName: string;
  enabled: boolean;
  displayOrder: number;
  iconUrl: string;
  rpcUrl: string | null;
  oracleAddress: string | null;
  xpub: string | null;
  confirmations: number;
}

export async function adminListPaymentMethods(): Promise<PaymentMethodAdmin[]> {
  return trpcVanilla.billing.adminListPaymentMethods.query(undefined);
}

export async function adminUpsertPaymentMethod(
  method: PaymentMethodAdmin,
): Promise<{ ok: boolean }> {
  return trpcVanilla.billing.adminUpsertPaymentMethod.mutate(method);
}

export async function adminTogglePaymentMethod(
  id: string,
  enabled: boolean,
): Promise<{ ok: boolean }> {
  return trpcVanilla.billing.adminTogglePaymentMethod.mutate({ id, enabled });
}

// --- Dividend types ---

export interface DividendWalletStats {
  poolCents: number;
  activeUsers: number;
  perUserCents: number;
  nextDistributionAt: string;
  userEligible: boolean;
  userLastPurchaseAt: string | null;
  userWindowExpiresAt: string | null;
}

export interface DividendHistoryEntry {
  date: string;
  amountCents: number;
  poolCents: number;
  activeUsers: number;
}

export interface DividendHistoryResponse {
  dividends: DividendHistoryEntry[];
}

export interface DividendLifetime {
  totalCents: number;
}

// --- Dividend API ---

export async function getDividendStats(): Promise<DividendWalletStats> {
  const res = await apiFetch<{
    pool_cents?: number;
    active_users?: number;
    per_user_cents?: number;
    next_distribution_at?: string;
    user_eligible?: boolean;
    user_last_purchase_at?: string | null;
    user_window_expires_at?: string | null;
  }>("/billing/dividend/stats");
  return {
    poolCents: res?.pool_cents ?? 0,
    activeUsers: res?.active_users ?? 0,
    perUserCents: res?.per_user_cents ?? 0,
    nextDistributionAt: res?.next_distribution_at ?? "",
    userEligible: res?.user_eligible ?? false,
    userLastPurchaseAt: res?.user_last_purchase_at ?? null,
    userWindowExpiresAt: res?.user_window_expires_at ?? null,
  };
}

export async function getDividendHistory(): Promise<DividendHistoryResponse> {
  const res = await apiFetch<{
    dividends?: Array<{
      date: string;
      amount_cents: number;
      pool_cents: number;
      active_users: number;
    }>;
  }>("/billing/dividend/history");
  const dividends = Array.isArray(res?.dividends) ? res.dividends : [];
  return {
    dividends: dividends.map((d) => ({
      date: d.date ?? "",
      amountCents: d.amount_cents ?? 0,
      poolCents: d.pool_cents ?? 0,
      activeUsers: d.active_users ?? 0,
    })),
  };
}

export async function getDividendLifetime(): Promise<DividendLifetime> {
  const res = await apiFetch<{ total_cents?: number }>("/billing/dividend/lifetime");
  return { totalCents: res?.total_cents ?? 0 };
}

// --- Hosted usage API (tRPC) ---

export async function getInferenceMode(): Promise<InferenceMode> {
  const res = await trpcVanilla.billing.inferenceMode.query(undefined);
  return res.mode;
}

export async function getHostedUsageSummary(): Promise<HostedUsageSummary> {
  return trpcVanilla.billing.hostedUsageSummary.query(undefined);
}

export async function getBillingUsageSummary(): Promise<BillingUsageSummary> {
  const res = await trpcVanilla.billing.usageSummary.query(undefined);
  return {
    periodStart: res?.period_start ?? "",
    periodEnd: res?.period_end ?? "",
    totalSpend: (res?.total_spend_cents ?? 0) / 100,
    includedCredit: (res?.included_credit_cents ?? 0) / 100,
    amountDue: (res?.amount_due_cents ?? 0) / 100,
    planName: res?.plan_name ?? "",
  };
}

export async function getHostedUsageEvents(params?: {
  capability?: HostedCapability;
  from?: string;
  to?: string;
}): Promise<HostedUsageEvent[]> {
  return trpcVanilla.billing.hostedUsageEvents.query(params ?? {});
}

export async function getSpendingLimits(): Promise<SpendingLimits> {
  return trpcVanilla.billing.spendingLimits.query(undefined);
}

export async function updateSpendingLimits(limits: SpendingLimits): Promise<void> {
  await trpcVanilla.billing.updateSpendingLimits.mutate({ ...limits });
}

// --- Affiliate API (tRPC) ---

export async function getAffiliateStats(): Promise<AffiliateStats> {
  const res = await trpcVanilla.billing.affiliateStats.query(undefined);
  return {
    referralCode: res?.referral_code ?? "",
    referralUrl: res?.referral_url ?? "",
    totalReferred: res?.total_referred ?? 0,
    totalConverted: res?.total_converted ?? 0,
    totalEarnedCents: res?.total_earned_cents ?? 0,
  };
}

export async function getAffiliateReferrals(params?: {
  limit?: number;
  offset?: number;
}): Promise<AffiliateReferralsResponse> {
  const res = await trpcVanilla.billing.affiliateReferrals.query({
    limit: params?.limit ?? 20,
    offset: params?.offset ?? 0,
  });
  const referrals = Array.isArray(res?.referrals) ? res.referrals : [];
  return {
    referrals: (
      referrals as Array<{
        id?: string;
        masked_email?: string;
        joined_at?: string;
        status?: string;
        match_amount_cents?: number | null;
      }>
    ).map((r) => ({
      id: r.id ?? "",
      maskedEmail: r.masked_email ?? "",
      joinedAt: r.joined_at ? new Date(r.joined_at).toISOString() : "",
      status: r.status ?? "pending",
      matchAmountCents: r.match_amount_cents ?? null,
    })) as Referral[],
    total: res?.total ?? 0,
  };
}

// --- Auto-topup API (tRPC) ---

export async function getAutoTopupSettings(): Promise<AutoTopupSettings> {
  return trpcVanilla.billing.autoTopupSettings.query(undefined);
}

export async function updateAutoTopupSettings(update: {
  usageBased?: { enabled: boolean; thresholdCents: number; topupAmountCents: number };
  scheduled?: { enabled: boolean; amountCents: number; interval: AutoTopupInterval };
}): Promise<AutoTopupSettings> {
  return trpcVanilla.billing.updateAutoTopupSettings.mutate(update);
}

// --- Account status types ---

export type AccountStatusValue = "active" | "grace_period" | "suspended" | "banned";

export interface AccountStatus {
  status: AccountStatusValue;
  statusReason: string | null;
  graceDeadline: string | null;
}

export async function getAccountStatus(): Promise<AccountStatus | null> {
  try {
    const res = await trpcVanilla.billing.accountStatus.query(undefined);
    return {
      status: (res?.status as AccountStatusValue) ?? "active",
      statusReason: res?.status_reason ?? null,
      graceDeadline: res?.grace_deadline ?? null,
    };
  } catch {
    // Endpoint may not exist yet — non-critical
    return null;
  }
}

// --- Model selection types ---

export interface ModelSelection {
  modelId: string;
  providerId: string;
  mode: "hosted" | "byok";
}

// --- Model selection API ---

export async function getModelSelection(): Promise<ModelSelection> {
  // NOTE: add tRPC procedure
  return apiFetch<ModelSelection>("/settings/model");
}

export async function updateModelSelection(data: ModelSelection): Promise<ModelSelection> {
  // NOTE: add tRPC procedure
  return apiFetch<ModelSelection>("/settings/model", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// --- Tenant key store API (AES-256-GCM encrypted backend) ---

export interface TenantKeyMeta {
  provider: string;
  hasKey: boolean;
  maskedKey: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function listTenantKeys(): Promise<TenantKeyMeta[]> {
  return apiFetch<TenantKeyMeta[]>("/tenant-keys");
}

export async function getTenantKey(provider: string): Promise<TenantKeyMeta> {
  return apiFetch<TenantKeyMeta>(`/tenant-keys/${encodeURIComponent(provider)}`);
}

export async function storeTenantKey(provider: string, key: string): Promise<TenantKeyMeta> {
  return apiFetch<TenantKeyMeta>(`/tenant-keys/${encodeURIComponent(provider)}`, {
    method: "PUT",
    body: JSON.stringify({ key }),
  });
}

export async function deleteTenantKey(provider: string): Promise<void> {
  await apiFetch(`/tenant-keys/${encodeURIComponent(provider)}`, { method: "DELETE" });
}

// --- BYOK key validation ---

export interface KeyValidationResult {
  valid: boolean;
  message?: string;
}

export async function validateDeepgramKey(key: string): Promise<KeyValidationResult> {
  const { testProviderKey: testProviderKeyViaTrpc } = await import("./settings-api");
  try {
    const result = await testProviderKeyViaTrpc("transcription", key);
    return result.valid
      ? { valid: true }
      : { valid: false, message: "Invalid API key. Please check and try again." };
  } catch (e) {
    log.warn("Key validation request failed", e);
    return { valid: false, message: "Could not validate key. Please try again." };
  }
}

export async function validateElevenLabsKey(key: string): Promise<KeyValidationResult> {
  const { testProviderKey, saveProviderKey: saveProviderKeyViaTrpc } = await import(
    "./settings-api"
  );
  try {
    const result = await testProviderKey("elevenlabs", key);
    if (result.valid) {
      await saveProviderKeyViaTrpc("elevenlabs", key);
      return { valid: true };
    }
    return {
      valid: false,
      message: result.error ?? "Invalid API key. Please check and try again.",
    };
  } catch (e) {
    log.warn("Key validation request failed", e);
    return { valid: false, message: "Could not validate key. Please try again." };
  }
}

// --- Notification preferences types ---

export interface NotificationPreferences {
  billing_low_balance: boolean;
  billing_receipts: boolean;
  billing_auto_topup: boolean;
  agent_channel_disconnect: boolean;
  agent_status_changes: boolean;
  account_role_changes: boolean;
  account_team_invites: boolean;
  fleet_updates: boolean;
}

// --- Public platform health (no auth required) ---

export interface PlatformServiceHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
}

export interface PlatformHealthResponse {
  status: HealthStatus;
  services: PlatformServiceHealth[];
  version: string;
  uptime: number;
}

export async function fetchPlatformHealth(): Promise<PlatformHealthResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as PlatformHealthResponse;
  } catch (e) {
    log.warn("Failed to fetch platform health", e);
    return null;
  }
}

// --- Snapshot types ---

export type SnapshotType = "nightly" | "on-demand" | "pre-restore";
export type SnapshotTrigger = "manual" | "scheduled" | "pre_update";

export interface Snapshot {
  id: string;
  instanceId: string;
  name: string | null;
  type: SnapshotType;
  trigger: SnapshotTrigger;
  sizeMb: number;
  createdAt: string;
  expiresAt: number | null;
}

/** List all snapshots for a bot instance. */
export async function listSnapshots(instanceId: string): Promise<Snapshot[]> {
  const data = await apiFetch<{ snapshots: Snapshot[] }>(`/bots/${instanceId}/snapshots`, {
    method: "GET",
  });
  return data.snapshots;
}

/** Create an on-demand snapshot. */
export async function createSnapshot(
  instanceId: string,
  name?: string,
): Promise<{ snapshot: Snapshot; estimatedMonthlyCost: string }> {
  return apiFetch<{ snapshot: Snapshot; estimatedMonthlyCost: string }>(
    `/bots/${instanceId}/snapshots`,
    {
      method: "POST",
      body: JSON.stringify(name ? { name } : {}),
    },
  );
}

/** Restore an instance from a snapshot. Uses the /instances/ route. */
export async function restoreSnapshot(instanceId: string, snapshotId: string): Promise<void> {
  await apiFetch<{ ok: boolean; restored: string }>(
    `/instances/${instanceId}/snapshots/${snapshotId}/restore`,
    { method: "POST" },
  );
}

/** Delete a snapshot. Backend returns 204 no content. */
export async function deleteSnapshot(instanceId: string, snapshotId: string): Promise<void> {
  const res = await apiFetchRaw(`/bots/${instanceId}/snapshots/${snapshotId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, res.statusText, (body as { error?: string }).error ?? undefined);
  }
}

// --- P2P Friends API types ---

export interface Friend {
  id: string;
  name: string;
  status: "online" | "offline" | "unknown";
  sharedCapabilities: string[];
  connectedAt: string;
}

export interface DiscoveredBot {
  id: string;
  name: string;
  capabilities: string[];
  discoveredAt: string;
}

export interface FriendRequest {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  direction: "inbound" | "outbound";
  status: "pending";
  createdAt: string;
}

export interface AutoAcceptConfig {
  enabled: boolean;
  rules: {
    requireCapabilities?: string[];
    maxFriends?: number;
  };
}

export interface CapabilityShareUpdate {
  capabilities: string[];
}

// --- P2P Friends API ---

export async function listFriends(instanceId: string): Promise<Friend[]> {
  const data = await apiFetch<{ friends: Friend[] }>(`/instances/${instanceId}/friends`, {
    method: "GET",
  });
  return data.friends;
}

export async function listDiscoveredBots(instanceId: string): Promise<DiscoveredBot[]> {
  const data = await apiFetch<{ discovered: DiscoveredBot[] }>(
    `/instances/${instanceId}/friends/discovered`,
    { method: "GET" },
  );
  return data.discovered;
}

export async function sendFriendRequest(instanceId: string, targetBotId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/instances/${instanceId}/friends/requests`, {
    method: "POST",
    body: JSON.stringify({ targetBotId }),
  });
}

export async function listFriendRequests(instanceId: string): Promise<FriendRequest[]> {
  const data = await apiFetch<{ requests: FriendRequest[] }>(
    `/instances/${instanceId}/friends/requests`,
    { method: "GET" },
  );
  return data.requests;
}

export async function acceptFriendRequest(instanceId: string, requestId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/instances/${instanceId}/friends/requests/${requestId}/accept`, {
    method: "POST",
  });
}

export async function rejectFriendRequest(instanceId: string, requestId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/instances/${instanceId}/friends/requests/${requestId}/reject`, {
    method: "POST",
  });
}

export async function removeFriend(instanceId: string, friendId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/instances/${instanceId}/friends/${friendId}`, {
    method: "DELETE",
  });
}

export async function updateFriendCapabilities(
  instanceId: string,
  friendId: string,
  capabilities: string[],
): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/instances/${instanceId}/friends/${friendId}/capabilities`, {
    method: "PATCH",
    body: JSON.stringify({ capabilities }),
  });
}

export async function getAutoAcceptConfig(instanceId: string): Promise<AutoAcceptConfig> {
  return apiFetch<AutoAcceptConfig>(`/instances/${instanceId}/friends/auto-accept`, {
    method: "GET",
  });
}

export async function updateAutoAcceptConfig(
  instanceId: string,
  config: AutoAcceptConfig,
): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/instances/${instanceId}/friends/auto-accept`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

// --- Login History API ---

export interface LoginAttempt {
  id: string;
  timestamp: string;
  userAgent: string;
  ip: string;
  location: string | null;
  success: boolean;
}

export interface LoginHistoryResponse {
  attempts: LoginAttempt[];
  total: number;
  hasMore: boolean;
}

export async function fetchLoginHistory(params: {
  limit?: number;
  offset?: number;
}): Promise<LoginHistoryResponse> {
  const query = new URLSearchParams();
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiFetch<LoginHistoryResponse>(`/settings/login-history${qs ? `?${qs}` : ""}`);
}

// --- Audit Log API ---

export interface AuditEvent {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName: string | null;
  details: string | null;
  createdAt: string;
}

export interface AuditLogResponse {
  events: AuditEvent[];
  total: number;
  hasMore: boolean;
}

export async function fetchAuditLog(params: {
  limit?: number;
  offset?: number;
  since?: string;
  until?: string;
  action?: string;
  search?: string;
}): Promise<AuditLogResponse> {
  const query = new URLSearchParams();
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));
  if (params.since) query.set("since", params.since);
  if (params.until) query.set("until", params.until);
  if (params.action) query.set("action", params.action);
  if (params.search) query.set("search", params.search);
  const qs = query.toString();
  return apiFetch<AuditLogResponse>(`/audit${qs ? `?${qs}` : ""}`);
}

// --- Typed helpers used by components ---

export interface VpsInfo {
  botId: string;
  status: "active" | "canceling" | "canceled";
  hostname: string | null;
  sshConnectionString: string | null;
  diskSizeGb: number;
  createdAt: string;
}

/** Fetch VPS info for a bot. Returns null if not found or on error. */
export async function getVpsInfo(botId: string): Promise<VpsInfo | null> {
  const res = await apiFetchRaw(`/fleet/bots/${botId}/vps-info`);
  if (!res.ok) return null;
  return res.json() as Promise<VpsInfo>;
}

export interface VpsUpgradeResult {
  url?: string;
}

/** Initiate a VPS upgrade for a bot. Returns the raw Response for status inspection (409, 402). */
export async function upgradeToVps(
  botId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<Response> {
  return apiFetchRaw(`/fleet/bots/${botId}/upgrade-to-vps`, {
    method: "POST",
    body: JSON.stringify({ successUrl, cancelUrl }),
  });
}

export interface OAuthInitiateResult {
  authorizeUrl: string;
  state: string;
}

/** Initiate OAuth flow. Returns the raw Response so callers can inspect errors. */
export async function initiateChannelOAuth(provider: string): Promise<Response> {
  return platformFetchRaw(`/api/channel-oauth/initiate`, {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}

export interface OAuthPollResult {
  status: "pending" | "completed" | "expired";
  token?: string;
}

/** Poll for OAuth token after the popup callback. */
export async function pollChannelOAuth(state: string): Promise<OAuthPollResult> {
  const res = await platformFetchRaw(`/api/channel-oauth/poll?state=${encodeURIComponent(state)}`);
  if (!res.ok) throw new Error("Failed to retrieve token");
  return res.json() as Promise<OAuthPollResult>;
}

/** Post a message to the onboarding quick-setup endpoint. Returns the raw Response. */
export async function quickSetup(apiKey: string, channel: string): Promise<Response> {
  return apiFetchRaw(`/onboarding/quick-setup`, {
    method: "POST",
    body: JSON.stringify({ apiKey, channel }),
  });
}

/** Send a chat message. Fire-and-forget; caller handles errors. */
export async function sendChatMessage(sessionId: string, message: string): Promise<void> {
  await apiFetchRaw(`/chat`, {
    method: "POST",
    body: JSON.stringify({ sessionId, message }),
  });
}

/** Open an SSE stream for chat. Returns the raw Response for body reading. */
export async function openChatStream(sessionId: string, signal: AbortSignal): Promise<Response> {
  const tenantId = getActiveTenantId();
  const res = await fetch(`${API_BASE_URL}/chat/stream`, {
    headers: {
      "X-Session-ID": sessionId,
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    },
    credentials: "include",
    signal,
  });
  return res;
}
