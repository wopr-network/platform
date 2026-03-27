import { describe, expect, it, vi } from "vitest";
import {
  channelPlugins,
  collectConfigFields,
  getAllPlugins,
  getChannelPlugins,
  getPluginById,
  pluginCategories,
  presets,
  providerPlugins,
  resolveDependencies,
  validateField,
} from "@/lib/onboarding-data";

vi.mock("@/lib/marketplace-data", () => ({
  listMarketplacePlugins: vi.fn().mockResolvedValue([
    {
      id: "discord",
      name: "Discord",
      description: "Discord channel",
      icon: "MessageCircle",
      color: "#5865F2",
      category: "channel",
      capabilities: ["channel"],
      version: "1.0.0",
      author: "Platform",
      tags: [],
      requires: [],
      install: [],
      configSchema: [],
      setup: [],
      installCount: 0,
      changelog: [],
    },
    {
      id: "slack",
      name: "Slack",
      description: "Slack channel",
      icon: "Hash",
      color: "#4A154B",
      category: "channel",
      capabilities: ["channel"],
      version: "1.0.0",
      author: "Platform",
      tags: [],
      requires: [],
      install: [],
      configSchema: [],
      setup: [],
      installCount: 0,
      changelog: [],
    },
    {
      id: "memory-plugin",
      name: "Memory",
      description: "Not a channel",
      icon: "Brain",
      color: "#10B981",
      category: "memory",
      capabilities: ["memory"],
      version: "1.0.0",
      author: "Platform",
      tags: [],
      requires: [],
      install: [],
      configSchema: [],
      setup: [],
      installCount: 0,
      changelog: [],
    },
  ]),
}));

describe("onboarding-data", () => {
  describe("channelPlugins", () => {
    it("includes Signal, WhatsApp, MS Teams (onboarding-only channels; Discord/Slack/Telegram are marketplace-sourced via getChannelPlugins)", () => {
      const ids = channelPlugins.map((p) => p.id);
      expect(ids).toContain("signal");
      expect(ids).toContain("whatsapp");
      expect(ids).toContain("msteams");
    });

    it("all channels have capabilities including 'channel'", () => {
      for (const ch of channelPlugins) {
        expect(ch.capabilities).toContain("channel");
      }
    });

    it("Signal has phone number config field", () => {
      const signal = channelPlugins.find((p) => p.id === "signal");
      expect(signal).toMatchObject({
        id: "signal",
        name: "Signal",
        capabilities: ["channel"],
        configFields: expect.arrayContaining([expect.objectContaining({ key: "signal_phone" })]),
      });
      const keys = signal?.configFields.map((f) => f.key);
      expect(keys).toContain("signal_phone");
    });

    it("WhatsApp token is marked as secret", () => {
      const whatsapp = channelPlugins.find((p) => p.id === "whatsapp");
      const tokenField = whatsapp?.configFields.find((f) => f.key === "whatsapp_token");
      expect(tokenField?.secret).toBe(true);
    });
  });

  describe("providerPlugins", () => {
    it("includes Anthropic, OpenAI, Kimi, OpenCode", () => {
      const ids = providerPlugins.map((p) => p.id);
      expect(ids).toContain("anthropic");
      expect(ids).toContain("openai");
      expect(ids).toContain("kimi");
      expect(ids).toContain("opencode");
    });

    it("all providers have capabilities including 'provider'", () => {
      for (const p of providerPlugins) {
        expect(p.capabilities).toContain("provider");
      }
    });

    it("Anthropic key validation requires sk-ant- prefix", () => {
      const anthropic = providerPlugins.find((p) => p.id === "anthropic");
      const keyField = anthropic?.configFields[0];
      expect(keyField).toMatchObject({
        key: "anthropic_api_key",
        label: "Anthropic API Key",
        secret: true,
      });
      expect(keyField?.validation?.pattern).toBe("^sk-ant-");
    });
  });

  describe("pluginCategories", () => {
    it("has memory, voice, integration, and ui categories", () => {
      const ids = pluginCategories.map((c) => c.id);
      expect(ids).toEqual(["memory", "voice", "integration", "ui"]);
    });

    it("voice category includes ElevenLabs TTS and Deepgram STT", () => {
      const voice = pluginCategories.find((c) => c.id === "voice");
      const ids = voice?.plugins.map((p) => p.id);
      expect(ids).toContain("elevenlabs-tts");
      expect(ids).toContain("deepgram-stt");
    });

    it("discord-voice requires discord", () => {
      const voice = pluginCategories.find((c) => c.id === "voice");
      const discordVoice = voice?.plugins.find((p) => p.id === "discord-voice");
      expect(discordVoice?.requires).toContain("discord");
    });
  });

  describe("presets", () => {
    it("has 6 presets", () => {
      expect(presets).toHaveLength(6);
    });

    it("discord-ai-bot preset selects discord + anthropic + memory", () => {
      const preset = presets.find((p) => p.id === "discord-ai-bot");
      expect(preset).toMatchObject({
        id: "discord-ai-bot",
        name: "Discord AI Bot",
        channels: ["discord"],
        providers: ["anthropic"],
        plugins: ["semantic-memory"],
        keyCount: 2,
      });
      expect(preset?.channels).toEqual(["discord"]);
      expect(preset?.providers).toEqual(["anthropic"]);
      expect(preset?.plugins).toEqual(["semantic-memory"]);
      expect(preset?.keyCount).toBe(2);
    });

    it("custom preset has empty selections", () => {
      const custom = presets.find((p) => p.id === "custom");
      expect(custom).toMatchObject({
        id: "custom",
        name: "Custom",
        channels: [],
        providers: [],
        plugins: [],
      });
      expect(custom?.channels).toEqual([]);
      expect(custom?.providers).toEqual([]);
      expect(custom?.plugins).toEqual([]);
    });

    it("voice-enabled preset includes voice plugins", () => {
      const preset = presets.find((p) => p.id === "voice-enabled");
      expect(preset?.plugins).toContain("elevenlabs-tts");
      expect(preset?.plugins).toContain("deepgram-stt");
      expect(preset?.plugins).toContain("discord-voice");
    });
  });

  describe("getAllPlugins", () => {
    it("returns all plugins from all categories", () => {
      const all = getAllPlugins();
      expect(all.length).toBeGreaterThan(10);
      // Should include onboarding-only channels, providers, and optional plugins
      // (Discord/Slack/Telegram are marketplace-sourced via getChannelPlugins, not in static list)
      expect(all.map((p) => p.id)).toContain("signal");
      expect(all.map((p) => p.id)).toContain("anthropic");
      expect(all.map((p) => p.id)).toContain("semantic-memory");
    });
  });

  describe("getPluginById", () => {
    it("returns a plugin by id", () => {
      const signal = getPluginById("signal");
      expect(signal?.name).toBe("Signal");
    });

    it("returns undefined for unknown id", () => {
      expect(getPluginById("nonexistent")).toBeUndefined();
    });
  });

  describe("collectConfigFields", () => {
    it("collects fields from selected channels, providers, and plugins", () => {
      const fields = collectConfigFields(["signal"], ["anthropic"], ["elevenlabs-tts"]);
      const keys = fields.map((f) => f.key);
      expect(keys).toContain("signal_phone");
      expect(keys).toContain("anthropic_api_key");
      expect(keys).toContain("elevenlabs_api_key");
    });

    it("deduplicates fields by key", () => {
      const fields = collectConfigFields(["signal", "signal"], ["anthropic"], []);
      const phoneFields = fields.filter((f) => f.key === "signal_phone");
      expect(phoneFields).toHaveLength(1);
    });

    it("returns empty array for no selections", () => {
      const fields = collectConfigFields([], [], []);
      expect(fields).toHaveLength(0);
    });

    it("handles plugins with no config fields", () => {
      const fields = collectConfigFields([], [], ["semantic-memory"]);
      expect(fields).toHaveLength(0);
    });
  });

  describe("resolveDependencies", () => {
    it("returns selected plugins when no dependencies needed", () => {
      const resolved = resolveDependencies(["discord"], ["anthropic"], ["semantic-memory"]);
      expect(resolved).toContain("semantic-memory");
    });

    it("does not duplicate existing channel/provider when resolving requires", () => {
      // discord-voice requires discord, but discord is already in channels
      const resolved = resolveDependencies(["discord"], ["anthropic"], ["discord-voice"]);
      expect(resolved).toContain("discord-voice");
      // discord should NOT be added as a plugin since it is already a channel
      const discordCount = resolved.filter((id) => id === "discord").length;
      expect(discordCount).toBe(0);
    });

    it("adds dependency as plugin if not in channels or providers", () => {
      // discord-voice requires discord, but discord is NOT selected
      const resolved = resolveDependencies([], ["anthropic"], ["discord-voice"]);
      expect(resolved).toContain("discord-voice");
      expect(resolved).toContain("discord");
    });
  });

  describe("validateField", () => {
    it("returns error for empty value", () => {
      const field = {
        key: "test",
        label: "Test Key",
        secret: true,
      };
      expect(validateField(field, "")).toBe("Test Key is required");
      expect(validateField(field, "   ")).toBe("Test Key is required");
    });

    it("returns null for valid value without pattern", () => {
      const field = {
        key: "test",
        label: "Test Key",
        secret: true,
      };
      expect(validateField(field, "some-value")).toBeNull();
    });

    it("validates against pattern", () => {
      const field = {
        key: "anthropic_api_key",
        label: "Anthropic API Key",
        secret: true,
        validation: { pattern: "^sk-ant-", message: "Must start with sk-ant-" },
      };
      expect(validateField(field, "sk-ant-abc123")).toBeNull();
      expect(validateField(field, "sk-wrong")).toBe("Must start with sk-ant-");
    });

    it("returns validation message for invalid pattern", () => {
      const field = {
        key: "telegram_bot_token",
        label: "Telegram Bot Token",
        secret: true,
        validation: { pattern: "^[0-9]+:[A-Za-z0-9_-]+$", message: "Invalid Telegram token" },
      };
      expect(validateField(field, "123:ABC_def")).toBeNull();
      expect(validateField(field, "invalid token!")).toBe("Invalid Telegram token");
    });
  });

  describe("getChannelPlugins", () => {
    it("returns marketplace channels merged with onboarding-only channels", async () => {
      const channels = await getChannelPlugins();
      const ids = channels.map((c) => c.id);
      // Marketplace channels
      expect(ids).toContain("discord");
      expect(ids).toContain("slack");
      // Onboarding-only channels
      expect(ids).toContain("signal");
      expect(ids).toContain("whatsapp");
      expect(ids).toContain("msteams");
      // Non-channel plugins excluded
      expect(ids).not.toContain("memory-plugin");
    });

    it("applies CHANNEL_OVERLAY config fields to marketplace channels", async () => {
      const channels = await getChannelPlugins();
      const discord = channels.find((c) => c.id === "discord");
      expect(discord).toMatchObject({
        id: "discord",
        name: "Discord",
        capabilities: ["channel"],
      });
      const keys = discord?.configFields.map((f) => f.key);
      expect(keys).toContain("discord_bot_token");
      expect(keys).toContain("discord_guild_id");
    });

    it("applies CHANNEL_OVERLAY diyCostData to marketplace channels", async () => {
      const channels = await getChannelPlugins();
      const discord = channels.find((c) => c.id === "discord");
      expect(discord?.diyCostData).toMatchObject({
        diyLabel: "Discord bot hosting",
        diyCostPerMonth: "$5-20/mo",
        diyCostNumeric: 1200,
      });
      expect(discord?.diyCostData?.diyLabel).toBe("Discord bot hosting");
    });

    it("marketplace channels with overlay get their config fields", async () => {
      const channels = await getChannelPlugins();
      const slack = channels.find((c) => c.id === "slack");
      expect(slack).toMatchObject({
        id: "slack",
        name: "Slack",
        capabilities: ["channel"],
      });
      expect(slack?.configFields.length).toBeGreaterThan(0);
    });
  });
});
