// --- Plugin Manifest types ---

import { z } from "zod";
import { brandName } from "./brand-config";
import { logger } from "./logger";

const log = logger("marketplace");

export type PluginCategory =
  | "channel"
  | "provider"
  | "voice"
  | "memory"
  | "context"
  | "webhook"
  | "integration"
  | "ui"
  | "moderation"
  | "analytics";

export type SetupFlowType = "paste" | "oauth" | "qr" | "interactive";

const configSchemaFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["string", "number", "boolean", "select"]),
  required: z.boolean(),
  secret: z.boolean().optional(),
  setupFlow: z.enum(["paste", "oauth", "qr", "interactive"]).optional(),
  placeholder: z.string().optional(),
  description: z.string().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  validation: z.object({ pattern: z.string(), message: z.string() }).optional(),
  oauthProvider: z.string().optional(),
});

export type ConfigSchemaField = z.infer<typeof configSchemaFieldSchema>;

const setupStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  fields: z.array(configSchemaFieldSchema),
  instruction: z.string().optional(),
  externalUrl: z.string().optional(),
});

export type SetupStep = z.infer<typeof setupStepSchema>;

export type MarketplaceTab = "superpower" | "channel" | "capability" | "utility";

export const MARKETPLACE_TABS: { id: MarketplaceTab; label: string }[] = [
  { id: "superpower", label: "Superpowers" },
  { id: "channel", label: "Channels" },
  { id: "capability", label: "Capabilities" },
  { id: "utility", label: "Utilities" },
];

const pluginManifestSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default("No description provided"),
  version: z.string().default("unknown"),
  author: z.string().default("Unknown"),
  icon: z.string().default("Package"),
  color: z.string().default("#6B7280"),
  category: z
    .enum([
      "channel",
      "provider",
      "voice",
      "memory",
      "context",
      "webhook",
      "integration",
      "ui",
      "moderation",
      "analytics",
    ])
    .default("integration"),
  tags: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  requires: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  install: z.array(z.string()).default([]),
  configSchema: z.array(configSchemaFieldSchema).default([]),
  setup: z.array(setupStepSchema).default([]),
  installCount: z.number().default(0),
  changelog: z
    .array(z.object({ version: z.string(), date: z.string(), notes: z.string() }))
    .default([]),
  connectionTest: z.object({ label: z.string(), endpoint: z.string() }).optional(),
  superpowerHeadline: z.string().optional(),
  superpowerTagline: z.string().optional(),
  superpowerMarkdown: z.string().optional(),
  superpowerOutcomes: z.array(z.string()).optional(),
  marketplaceTab: z.enum(["superpower", "channel", "capability", "utility"]).optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

/** Parse and validate a plugin manifest, applying defaults for missing optional fields. Throws on invalid data (missing id or name). */
export function parseManifest(data: unknown): PluginManifest {
  return pluginManifestSchema.parse(data);
}

/** Safe version — returns null instead of throwing on invalid data. */
export function parseManifestSafe(data: unknown): PluginManifest | null {
  const result = pluginManifestSchema.safeParse(data);
  return result.success ? result.data : null;
}

// --- Hosted Adapter Registry ---
// Capabilities that have hosted adapter options.
// When a plugin declares a capability listed here, it gets a "Hosted Available" badge
// and the install flow shows a "Hosted" option for that capability.

export interface HostedAdapter {
  capability: string;
  label: string;
  description: string;
  pricing: string;
}

export const HOSTED_ADAPTERS: HostedAdapter[] = [
  {
    capability: "llm",
    label: `${brandName()} Hosted LLM`,
    description: "Managed LLM inference with automatic model routing.",
    pricing: "Pay-per-token",
  },
  {
    capability: "tts",
    label: `${brandName()} Hosted TTS`,
    description: "Managed text-to-speech synthesis.",
    pricing: "Pay-per-character",
  },
  {
    capability: "stt",
    label: `${brandName()} Hosted STT`,
    description: "Managed speech-to-text transcription.",
    pricing: "Pay-per-minute",
  },
  {
    capability: "embeddings",
    label: `${brandName()} Hosted Embeddings`,
    description: "Managed vector embeddings for semantic search.",
    pricing: "Pay-per-request",
  },
  {
    capability: "image-gen",
    label: `${brandName()} Hosted Image Generation`,
    description: "Managed image generation.",
    pricing: "Pay-per-image",
  },
];

export function getHostedAdaptersForCapabilities(capabilities: string[]): HostedAdapter[] {
  return HOSTED_ADAPTERS.filter((a) => capabilities.includes(a.capability));
}

export function hasHostedOption(capabilities: string[]): boolean {
  return HOSTED_ADAPTERS.some((a) => capabilities.includes(a.capability));
}

// --- Capability Color Map ---
// Consistent color-coded badges for capability types across all marketplace surfaces.

export const CAPABILITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  channel: { bg: "bg-blue-500/15", text: "text-blue-500", border: "border-blue-500/25" },
  llm: { bg: "bg-purple-500/15", text: "text-purple-500", border: "border-purple-500/25" },
  tts: { bg: "bg-amber-500/15", text: "text-amber-500", border: "border-amber-500/25" },
  stt: { bg: "bg-cyan-500/15", text: "text-cyan-500", border: "border-cyan-500/25" },
  voice: { bg: "bg-pink-500/15", text: "text-pink-500", border: "border-pink-500/25" },
  memory: { bg: "bg-violet-500/15", text: "text-violet-500", border: "border-violet-500/25" },
  embeddings: { bg: "bg-indigo-500/15", text: "text-indigo-500", border: "border-indigo-500/25" },
  webhook: { bg: "bg-yellow-500/15", text: "text-yellow-500", border: "border-yellow-500/25" },
  integration: { bg: "bg-orange-500/15", text: "text-orange-500", border: "border-orange-500/25" },
  ui: { bg: "bg-sky-500/15", text: "text-sky-500", border: "border-sky-500/25" },
  moderation: { bg: "bg-red-500/15", text: "text-red-500", border: "border-red-500/25" },
  analytics: { bg: "bg-emerald-500/15", text: "text-emerald-500", border: "border-emerald-500/25" },
  "image-gen": {
    bg: "bg-fuchsia-500/15",
    text: "text-fuchsia-500",
    border: "border-fuchsia-500/25",
  },
};

export function getCapabilityColor(cap: string) {
  return (
    CAPABILITY_COLORS[cap] ?? {
      bg: "bg-muted",
      text: "text-muted-foreground",
      border: "border-border",
    }
  );
}

// --- Categories list derived from manifests ---

export const ALL_CATEGORIES: { id: PluginCategory; label: string }[] = [
  { id: "channel", label: "Channel" },
  { id: "provider", label: "Provider" },
  { id: "voice", label: "Voice" },
  { id: "memory", label: "Memory" },
  { id: "context", label: "Context" },
  { id: "webhook", label: "Webhook" },
  { id: "integration", label: "Integration" },
  { id: "ui", label: "UI" },
  { id: "moderation", label: "Moderation" },
  { id: "analytics", label: "Analytics" },
];

// --- API functions (mock-first, same pattern as api.ts) ---

import { apiFetch, fleetFetch } from "./api";

export interface BotSummary {
  id: string;
  name: string;
  state: string;
}

export async function listBots(): Promise<BotSummary[]> {
  const data = await fleetFetch<{ bots: BotSummary[] }>("/bots");
  return data.bots;
}

export async function listMarketplacePlugins(): Promise<PluginManifest[]> {
  const res = await apiFetch<{ plugins: unknown[] } | unknown[]>("/marketplace/plugins");
  const raw = Array.isArray(res) ? res : res.plugins;
  return raw.map((item) => parseManifestSafe(item)).filter((r): r is PluginManifest => r !== null);
}

export interface PluginContentResponse {
  markdown: string;
  source: "superpower_md" | "manifest_description";
  version: string;
}

export async function getPluginContent(pluginId: string): Promise<PluginContentResponse | null> {
  try {
    return await apiFetch<PluginContentResponse>(`/marketplace/plugins/${pluginId}/content`);
  } catch (e) {
    log.warn("Failed to fetch plugin content", e);
    return null;
  }
}

export async function getMarketplacePlugin(id: string): Promise<PluginManifest | null> {
  const raw = await apiFetch<unknown>(`/marketplace/plugins/${id}`);
  return raw ? parseManifestSafe(raw) : null;
}

export async function installPlugin(
  pluginId: string,
  botId: string,
  config: Record<string, unknown>,
  providerChoices: Record<string, string>,
  primaryProviderOverrides?: Record<string, string>,
): Promise<{
  success: boolean;
  botId: string;
  pluginId: string;
  installedPlugins: string[];
  dispatched: boolean;
  dispatchError?: string;
}> {
  return fleetFetch(`/bots/${botId}/plugins/${pluginId}`, {
    method: "POST",
    body: JSON.stringify({ config, providerChoices, primaryProviderOverrides }),
  });
}

/** Fetch installed plugins for a bot, with enabled state. */
export async function listInstalledPlugins(
  botId: string,
): Promise<{ pluginId: string; enabled: boolean }[]> {
  const data = await fleetFetch<{
    botId: string;
    plugins: { pluginId: string; enabled: boolean }[];
  }>(`/bots/${botId}/plugins`);
  return data.plugins;
}

/** Toggle a plugin's enabled state on a bot. */
export async function togglePluginEnabled(
  botId: string,
  pluginId: string,
  enabled: boolean,
): Promise<void> {
  await fleetFetch(`/bots/${botId}/plugins/${pluginId}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function formatInstallCount(count: number): string {
  if (count >= 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

// --- Client-side capability conflict detection (UI complement to WOP-1516) ---

export interface CapabilityConflict {
  capability: string;
  existingPluginId: string;
  existingPluginName: string;
  newPluginId: string;
}

/**
 * Detect capability conflicts between a plugin being installed and already-installed plugins.
 * Mirrors platform-side detectCapabilityConflicts from WOP-1516.
 */
export function detectCapabilityConflictsClient(
  newPlugin: PluginManifest,
  installedPluginIds: string[],
  allPlugins: PluginManifest[],
): CapabilityConflict[] {
  if (newPlugin.capabilities.length === 0) return [];

  const capToPlugin = new Map<string, PluginManifest>();
  for (const p of allPlugins) {
    if (!installedPluginIds.includes(p.id)) continue;
    for (const cap of p.capabilities) {
      if (!capToPlugin.has(cap)) {
        capToPlugin.set(cap, p);
      }
    }
  }

  const conflicts: CapabilityConflict[] = [];
  for (const cap of newPlugin.capabilities) {
    const existing = capToPlugin.get(cap);
    if (existing) {
      conflicts.push({
        capability: cap,
        existingPluginId: existing.id,
        existingPluginName: existing.name,
        newPluginId: newPlugin.id,
      });
    }
  }
  return conflicts;
}
