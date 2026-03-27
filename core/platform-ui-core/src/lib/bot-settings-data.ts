import { apiFetch, apiFetchRaw } from "./api";
import { envKey } from "./brand-config";
import { ApiError } from "./errors";
import { logger } from "./logger";

const log = logger("bot-settings");

// --- Bot Settings types ---

export interface BotIdentity {
  name: string;
  avatar: string;
  personality: string;
}

export interface PersonalityTemplate {
  id: string;
  label: string;
  text: string;
}

export const PERSONALITY_TEMPLATES: PersonalityTemplate[] = [
  {
    id: "professional",
    label: "Professional",
    text: "You are a professional assistant. You communicate clearly, concisely, and formally. You focus on accuracy and efficiency.",
  },
  {
    id: "creative",
    label: "Creative",
    text: "You are a creative companion. You think outside the box, use vivid language, and love brainstorming new ideas. You are enthusiastic and imaginative.",
  },
  {
    id: "casual",
    label: "Casual",
    text: "You are a laid-back, friendly assistant. You keep things simple, use conversational language, and don't take yourself too seriously.",
  },
  {
    id: "custom",
    label: "Custom",
    text: "",
  },
];

export interface BotBrain {
  provider: string;
  model: string;
  mode: "hosted" | "byok";
  costPerMessage: string;
  description: string;
}

export interface BotChannel {
  id: string;
  type: string;
  name: string;
  status: "connected" | "disconnected" | "always-on";
  stats: string;
}

export interface AvailableChannel {
  type: string;
  label: string;
}

export interface ActiveSuperpower {
  id: string;
  name: string;
  icon: string;
  mode: "hosted" | "byok";
  provider: string;
  model: string;
  usageCount: number;
  usageLabel: string;
  spend: number;
}

export interface AvailableSuperpower {
  id: string;
  name: string;
  icon: string;
  description: string;
  pricing: string;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: "active" | "disabled";
  capabilities: string[];
}

export interface DiscoverPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  needs: string[];
}

export interface CapabilityUsage {
  capability: string;
  icon: string;
  spend: number;
  percent: number;
}

export interface UsageTrendPoint {
  date: string;
  spend: number;
}

export interface BotUsage {
  totalSpend: number;
  creditBalance: number;
  capabilities: CapabilityUsage[];
  trend: UsageTrendPoint[];
}

export interface BotSettings {
  id: string;
  identity: BotIdentity;
  brain: BotBrain;
  channels: BotChannel[];
  availableChannels: AvailableChannel[];
  activeSuperpowers: ActiveSuperpower[];
  availableSuperpowers: AvailableSuperpower[];
  installedPlugins: InstalledPlugin[];
  discoverPlugins: DiscoverPlugin[];
  usage: BotUsage;
  status: "running" | "stopped" | "archived";
}

// --- API functions ---

export async function getBotSettings(botId: string): Promise<BotSettings> {
  return apiFetch<BotSettings>(`/fleet/bots/${botId}/settings`);
}

export async function updateBotIdentity(
  botId: string,
  identity: BotIdentity,
): Promise<BotIdentity> {
  return apiFetch<BotIdentity>(`/fleet/bots/${botId}/identity`, {
    method: "PUT",
    body: JSON.stringify(identity),
  });
}

export async function activateSuperpower(
  botId: string,
  superpowerId: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/fleet/bots/${botId}/capabilities/${superpowerId}/activate`,
    { method: "POST" },
  );
}

// --- Storage tier types ---

export interface StorageTierInfo {
  key: string;
  label: string;
  storageLimitGb: number;
  dailyCostCents: number;
  description: string;
}

export interface StorageUsage {
  usedBytes: number;
  totalBytes: number;
  availableBytes: number;
}

export async function getStorageTier(botId: string): Promise<{ tier: string }> {
  return apiFetch<{ tier: string }>(`/fleet/bots/${botId}/storage-tier`);
}

export async function setStorageTier(botId: string, tier: string): Promise<{ tier: string }> {
  return apiFetch<{ tier: string }>(`/fleet/bots/${botId}/storage-tier`, {
    method: "PUT",
    body: JSON.stringify({ tier }),
  });
}

export async function getStorageUsage(botId: string): Promise<StorageUsage | null> {
  try {
    return await apiFetch<StorageUsage>(`/fleet/bots/${botId}/storage-usage`);
  } catch (e) {
    log.warn("Failed to fetch storage usage", e);
    return null;
  }
}

export async function getResourceTier(botId: string): Promise<{ tier: string }> {
  return apiFetch<{ tier: string }>(`/fleet/bots/${botId}/resource-tier`);
}

export async function setResourceTier(
  botId: string,
  tier: string,
): Promise<{ tier: string; dailyCostCents: number }> {
  return apiFetch<{ tier: string; dailyCostCents: number }>(`/fleet/bots/${botId}/resource-tier`, {
    method: "PUT",
    body: JSON.stringify({ tier }),
  });
}

export async function getBotStatus(botId: string): Promise<{ status: BotSettings["status"] }> {
  const settings = await apiFetch<BotSettings>(`/fleet/bots/${botId}/settings`);
  return { status: settings.status };
}

export async function controlBot(
  botId: string,
  action: "start" | "stop" | "restart" | "archive" | "delete",
): Promise<void> {
  if (action === "delete") {
    await apiFetch(`/fleet/bots/${botId}`, { method: "DELETE" });
  } else {
    await apiFetch(`/fleet/bots/${botId}/${action}`, { method: "POST" });
  }
}

/** Update bot's LLM model and provider mode */
export async function updateBotBrain(
  botId: string,
  brain: { model?: string; provider?: string; mode?: "hosted" | "byok" },
): Promise<void> {
  const env: Record<string, string> = {};
  if (brain.model) env[envKey("LLM_MODEL")] = brain.model;
  if (brain.provider) env[envKey("LLM_PROVIDER")] = brain.provider;
  if (brain.mode) env[envKey("LLM_MODE")] = brain.mode;
  await apiFetch(`/fleet/bots/${botId}`, {
    method: "PATCH",
    body: JSON.stringify({ env }),
  });
}

/** Disconnect a channel from a bot */
export async function disconnectChannel(botId: string, channelId: string): Promise<void> {
  await apiFetch(`/fleet/bots/${botId}/channels/${channelId}`, {
    method: "DELETE",
  });
}

/** Toggle a plugin's enabled/disabled state */
export async function togglePlugin(
  botId: string,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  await apiFetch(`/fleet/bots/${botId}/plugins/${pluginId}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

/** Install a plugin on a bot */
export async function installPlugin(botId: string, pluginId: string): Promise<void> {
  await apiFetch(`/fleet/bots/${botId}/plugins/${pluginId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Uninstall a plugin from a bot */
export async function uninstallPlugin(botId: string, pluginId: string): Promise<void> {
  const res = await apiFetchRaw(`/fleet/bots/${botId}/plugins/${pluginId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, res.statusText, (body as { error?: string }).error ?? undefined);
  }
  // 204 No Content or 200 — success, skip json parsing
}

/** Fetch channel configuration */
export async function getChannelConfig(
  botId: string,
  channelId: string,
): Promise<Record<string, string>> {
  return apiFetch<Record<string, string>>(`/fleet/bots/${botId}/channels/${channelId}/config`);
}

/** Save channel configuration */
export async function updateChannelConfig(
  botId: string,
  channelId: string,
  config: Record<string, string>,
): Promise<void> {
  await apiFetch(`/fleet/bots/${botId}/channels/${channelId}/config`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

/** Fetch plugin configuration */
export async function getPluginConfig(
  botId: string,
  pluginId: string,
): Promise<Record<string, string>> {
  return apiFetch<Record<string, string>>(`/fleet/bots/${botId}/plugins/${pluginId}/config`);
}

/** Save plugin configuration */
export async function updatePluginConfig(
  botId: string,
  pluginId: string,
  config: Record<string, string>,
): Promise<void> {
  await apiFetch(`/fleet/bots/${botId}/plugins/${pluginId}/config`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

/** Fetch superpower configuration */
export async function getSuperpowerConfig(
  botId: string,
  superpowerId: string,
): Promise<Record<string, string>> {
  return apiFetch<Record<string, string>>(
    `/fleet/bots/${botId}/capabilities/${superpowerId}/config`,
  );
}

/** Save superpower configuration */
export async function updateSuperpowerConfig(
  botId: string,
  superpowerId: string,
  config: Record<string, string>,
): Promise<void> {
  await apiFetch(`/fleet/bots/${botId}/capabilities/${superpowerId}/config`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}
