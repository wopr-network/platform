import type {
  CapabilityMetaEntry,
  CapabilityMode,
  CapabilityName,
  CapabilitySetting,
  NotificationPreferences,
} from "./api";
import { trpcVanilla } from "./trpc";

type ProviderName = "discord" | "google" | "deepgram" | "elevenlabs" | "anthropic" | "openai";

// ---- Settings API calls ----

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return trpcVanilla.settings.notificationPreferences.query(undefined);
}

export async function updateNotificationPreferences(
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return trpcVanilla.settings.updateNotificationPreferences.mutate(prefs);
}

// ---- Capabilities API calls ----

export async function saveProviderKey(
  provider: string,
  key: string,
): Promise<{ ok: true; id: string; provider: string }> {
  return trpcVanilla.capabilities.storeKey.mutate({
    provider: provider as ProviderName,
    apiKey: key,
  });
}

export async function testProviderKey(
  provider: string,
  key?: string,
): Promise<{ valid: boolean; error?: string }> {
  return trpcVanilla.capabilities.testKey.mutate({
    provider: provider as ProviderName,
    key: key ?? "",
  });
}

export async function listCapabilities(): Promise<CapabilitySetting[]> {
  return trpcVanilla.capabilities.listCapabilitySettings.query(undefined);
}

export async function updateCapability(
  capability: CapabilityName,
  data: { mode: CapabilityMode; key?: string },
): Promise<CapabilitySetting> {
  return trpcVanilla.capabilities.updateCapabilitySettings.mutate({
    capability,
    mode: data.mode,
    key: data.key,
  });
}

export async function fetchCapabilityMeta(): Promise<CapabilityMetaEntry[]> {
  return trpcVanilla.capabilities.listCapabilityMeta.query(undefined);
}
