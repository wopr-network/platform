import { describe, expect, it } from "vitest";
import type { PluginManifest } from "../lib/marketplace-data";
import { detectCapabilityConflictsClient } from "../lib/marketplace-data";

const makePlugin = (
  overrides: Partial<PluginManifest> & { id: string; name: string },
): PluginManifest => ({
  description: "",
  version: "1.0.0",
  author: "Test",
  icon: "Package",
  color: "#000",
  category: "integration",
  tags: [],
  capabilities: [],
  requires: [],
  install: [],
  configSchema: [],
  setup: [],
  installCount: 0,
  changelog: [],
  ...overrides,
});

const ttsPlugin = makePlugin({
  id: "elevenlabs-tts",
  name: "ElevenLabs TTS",
  capabilities: ["voice", "tts"],
});
const sttPlugin = makePlugin({
  id: "deepgram-stt",
  name: "Deepgram STT",
  capabilities: ["voice", "stt"],
});
const discordPlugin = makePlugin({ id: "discord", name: "Discord", capabilities: ["channel"] });
const anotherTts = makePlugin({
  id: "another-tts",
  name: "Another TTS",
  capabilities: ["tts", "audio"],
});

const allPlugins = [ttsPlugin, sttPlugin, discordPlugin, anotherTts];

describe("detectCapabilityConflictsClient", () => {
  it("returns empty array when no conflicts", () => {
    const conflicts = detectCapabilityConflictsClient(
      discordPlugin,
      ["elevenlabs-tts"],
      allPlugins,
    );
    expect(conflicts).toEqual([]);
  });

  it("detects single capability conflict", () => {
    const conflicts = detectCapabilityConflictsClient(anotherTts, ["elevenlabs-tts"], allPlugins);
    expect(conflicts).toEqual([
      {
        capability: "tts",
        existingPluginId: "elevenlabs-tts",
        existingPluginName: "ElevenLabs TTS",
        newPluginId: "another-tts",
      },
    ]);
  });

  it("detects multiple capability conflicts", () => {
    const conflicts = detectCapabilityConflictsClient(sttPlugin, ["elevenlabs-tts"], allPlugins);
    expect(conflicts).toEqual([
      {
        capability: "voice",
        existingPluginId: "elevenlabs-tts",
        existingPluginName: "ElevenLabs TTS",
        newPluginId: "deepgram-stt",
      },
    ]);
  });

  it("returns empty when new plugin has no capabilities", () => {
    const noCapPlugin = makePlugin({ id: "nocap", name: "No Cap", capabilities: [] });
    const conflicts = detectCapabilityConflictsClient(noCapPlugin, ["elevenlabs-tts"], allPlugins);
    expect(conflicts).toEqual([]);
  });

  it("returns empty when no plugins installed", () => {
    const conflicts = detectCapabilityConflictsClient(ttsPlugin, [], allPlugins);
    expect(conflicts).toEqual([]);
  });
});
