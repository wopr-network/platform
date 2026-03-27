// Typed re-export of shared fixture data. Import this file normally in test files.
// The raw data lives in mock-manifests-data.js for require()-compatibility inside vi.hoisted().
import type { ChannelManifest } from "../../lib/channel-manifests";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const data = require("./mock-manifests-data") as {
  MARKETPLACE_TEST_PLUGINS: Array<Record<string, unknown>>;
  INSTALL_FLOW_TEST_PLUGINS: Array<Record<string, unknown>>;
  findManifest: (id: string) => Record<string, unknown>;
  DISCORD_MANIFEST: ChannelManifest;
  TELEGRAM_MANIFEST: ChannelManifest;
  SLACK_MANIFEST: ChannelManifest;
  CHANNEL_MANIFESTS_FIXTURE: ChannelManifest[];
};

export const MARKETPLACE_TEST_PLUGINS: Array<Record<string, unknown>> =
  data.MARKETPLACE_TEST_PLUGINS;
export const INSTALL_FLOW_TEST_PLUGINS: Array<Record<string, unknown>> =
  data.INSTALL_FLOW_TEST_PLUGINS;
export const findManifest: (id: string) => Record<string, unknown> = data.findManifest;
export const DISCORD_MANIFEST: ChannelManifest = data.DISCORD_MANIFEST;
export const TELEGRAM_MANIFEST: ChannelManifest = data.TELEGRAM_MANIFEST;
export const SLACK_MANIFEST: ChannelManifest = data.SLACK_MANIFEST;
export const CHANNEL_MANIFESTS_FIXTURE: ChannelManifest[] = data.CHANNEL_MANIFESTS_FIXTURE;
