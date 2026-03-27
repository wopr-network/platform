// Channel-specific manifest types and lookup functions.
// The canonical plugin data lives in marketplace-data.ts; this module filters for channels.

import {
  type ConfigSchemaField,
  listMarketplacePlugins,
  type SetupStep as MarketplaceSetupStep,
  type SetupFlowType,
} from "./marketplace-data";

export type { SetupFlowType };

// Re-export ConfigSchemaField as ConfigField for backward compat
export type ConfigField = ConfigSchemaField;

// Re-export SetupStep for backward compat
export type SetupStep = MarketplaceSetupStep;

export interface ChannelManifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  setup: MarketplaceSetupStep[];
  connectionTest?: {
    label: string;
    endpoint: string;
  };
}

export async function getChannelManifests(): Promise<ChannelManifest[]> {
  const plugins = await listMarketplacePlugins();
  return plugins
    .filter((m) => m.category === "channel")
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      color: m.color,
      setup: m.setup,
      connectionTest: m.connectionTest,
    }));
}

export async function getManifest(pluginId: string): Promise<ChannelManifest | undefined> {
  const manifests = await getChannelManifests();
  return manifests.find((m) => m.id === pluginId);
}
