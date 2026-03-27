import { PROVIDER_DOC_URLS } from "../config/provider-docs";
import { listMarketplacePlugins } from "./marketplace-data";

// --- Personalities ---

export interface Personality {
  id: string;
  name: string;
  description: string;
}

export const personalities: Personality[] = [
  { id: "helpful", name: "Helpful assistant", description: "Friendly and informative." },
  { id: "creative", name: "Creative collaborator", description: "Imaginative and playful." },
  { id: "code", name: "Code companion", description: "Technical and precise." },
  { id: "custom", name: "Custom", description: "Describe your own personality." },
];

// --- BYOK AI Provider choice ---

export type ByokAiProvider = "openai" | "openrouter";

export const openaiKeyField: OnboardingConfigField = {
  key: "openai_api_key",
  label: "OpenAI API Key",
  secret: true,
  placeholder: "sk-...",
  helpUrl: PROVIDER_DOC_URLS.openai,
  helpText: "Covers embeddings, search, and text generation.",
  validation: { pattern: "^sk-", message: "Must start with sk-" },
};

export const openrouterKeyField: OnboardingConfigField = {
  key: "openrouter_api_key",
  label: "OpenRouter API Key",
  secret: true,
  placeholder: "sk-or-...",
  helpUrl: PROVIDER_DOC_URLS.openrouter,
  helpText: "Covers embeddings, search, and 200+ AI models.",
  validation: { pattern: "^sk-or-", message: "Must start with sk-or-" },
};

/** Superpower IDs that share a single OpenAI/OpenRouter key */
export const AI_KEY_SUPERPOWER_IDS = ["memory", "search", "text-gen"] as const;

// --- Superpowers ---

export interface DiyCostData {
  diyLabel: string;
  diyCostPerMonth: string;
  diyCostNumeric: number; // cents, for summing
  accounts: string[];
  apiKeys: string[];
  hardware: string | null;
}

export interface Superpower {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  /** Whether this superpower needs an API key under BYOK mode */
  requiresKey: boolean;
  configFields: OnboardingConfigField[];
  /** If true, this superpower uses the shared OpenAI/OpenRouter key */
  usesAiKey?: boolean;
  /** DIY cost metadata for the cost comparison step */
  diyCostData?: DiyCostData;
}

export const superpowers: Superpower[] = [
  {
    id: "image-gen",
    name: "ImageGen",
    tagline: "/imagine anything",
    description: "Generate images from text descriptions.",
    icon: "Image",
    color: "#F59E0B",
    requiresKey: true,
    configFields: [
      {
        key: "replicate_api_token",
        label: "Replicate API Token",
        secret: true,
        placeholder: "r8_...",
        helpUrl: PROVIDER_DOC_URLS.replicate,
        helpText: "Used for image and video generation via Replicate.",
        validation: { pattern: "^r8_", message: "Must start with r8_" },
      },
    ],
    diyCostData: {
      diyLabel: "Image generation API",
      diyCostPerMonth: "$10-50/mo",
      diyCostNumeric: 3000,
      accounts: ["Replicate"],
      apiKeys: ["Replicate API Token"],
      hardware: null,
    },
  },
  {
    id: "video-gen",
    name: "VideoGen",
    tagline: "/video in any channel",
    description: "Generate videos from text descriptions.",
    icon: "Video",
    color: "#EF4444",
    requiresKey: true,
    configFields: [
      {
        key: "replicate_api_token",
        label: "Replicate API Token",
        secret: true,
        placeholder: "r8_...",
        helpUrl: PROVIDER_DOC_URLS.replicate,
        helpText: "Used for image and video generation via Replicate.",
        validation: { pattern: "^r8_", message: "Must start with r8_" },
      },
    ],
    diyCostData: {
      diyLabel: "Video generation API",
      diyCostPerMonth: "$20-100/mo",
      diyCostNumeric: 6000,
      accounts: ["Replicate"],
      apiKeys: ["Replicate API Token"],
      hardware: null,
    },
  },
  {
    id: "voice",
    name: "Voice",
    tagline: "Talk out loud",
    description: "Speech-to-text and text-to-speech.",
    icon: "Mic",
    color: "#8B5CF6",
    requiresKey: true,
    configFields: [
      {
        key: "elevenlabs_api_key",
        label: "ElevenLabs API Key",
        secret: true,
        placeholder: "Paste your ElevenLabs API key",
        helpUrl: PROVIDER_DOC_URLS.elevenlabs,
        helpText: "Used for text-to-speech synthesis.",
      },
    ],
    diyCostData: {
      diyLabel: "Voice synthesis API",
      diyCostPerMonth: "$5-30/mo",
      diyCostNumeric: 1500,
      accounts: ["ElevenLabs"],
      apiKeys: ["ElevenLabs API Key"],
      hardware: null,
    },
  },
  {
    id: "memory",
    name: "Memory",
    tagline: "Remembers everything",
    description: "Long-term memory with semantic search across conversations.",
    icon: "Brain",
    color: "#10B981",
    requiresKey: true,
    usesAiKey: true,
    configFields: [openaiKeyField],
    diyCostData: {
      diyLabel: "Vector DB + embeddings",
      diyCostPerMonth: "$10-40/mo",
      diyCostNumeric: 2500,
      accounts: ["OpenAI or OpenRouter"],
      apiKeys: ["OpenAI/OpenRouter API Key"],
      hardware: "Vector database (Pinecone, Qdrant, etc.)",
    },
  },
  {
    id: "search",
    name: "Search",
    tagline: "Web + docs",
    description: "Search the web and documents for real-time information.",
    icon: "Search",
    color: "#3B82F6",
    requiresKey: true,
    usesAiKey: true,
    configFields: [openaiKeyField],
    diyCostData: {
      diyLabel: "Web search API",
      diyCostPerMonth: "$5-20/mo",
      diyCostNumeric: 1200,
      accounts: ["OpenAI or OpenRouter"],
      apiKeys: ["OpenAI/OpenRouter API Key"],
      hardware: null,
    },
  },
  {
    id: "text-gen",
    name: "Text-gen",
    tagline: "AI chat models",
    description: "Access text generation models for chat and reasoning.",
    icon: "MessageSquare",
    color: "#6366F1",
    requiresKey: true,
    usesAiKey: true,
    configFields: [openaiKeyField],
    diyCostData: {
      diyLabel: "LLM inference API",
      diyCostPerMonth: "$20-200/mo",
      diyCostNumeric: 10000,
      accounts: ["OpenAI or OpenRouter"],
      apiKeys: ["OpenAI/OpenRouter API Key"],
      hardware: null,
    },
  },
];

export interface PluginOption {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  capabilities: string[];
  requires?: string[];
  configFields: OnboardingConfigField[];
  /** DIY cost metadata for the cost comparison step */
  diyCostData?: DiyCostData;
}

export interface OnboardingConfigField {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  helpUrl?: string;
  helpText?: string;
  validation?: {
    pattern: string;
    message: string;
  };
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  channels: string[];
  providers: string[];
  plugins: string[];
  keyCount: number;
}

// --- Channels ---

// Onboarding-specific overlay per marketplace channel plugin.
// configFields use OnboardingConfigField (with helpUrl, helpText) which differs from
// marketplace configSchema fields. Kept separate intentionally — they serve
// the onboarding BYOK flow, not the marketplace install wizard.
// diyCostData is co-located here so adding a new channel only requires one entry.
const CHANNEL_OVERLAY: Record<
  string,
  { configFields: OnboardingConfigField[]; diyCostData?: DiyCostData }
> = {
  discord: {
    configFields: [
      {
        key: "discord_bot_token",
        label: "Discord Bot Token",
        secret: true,
        placeholder: "Paste your Discord bot token",
        helpUrl: PROVIDER_DOC_URLS.discord,
        helpText: "Create an app in the Discord Developer Portal, then copy the bot token.",
        validation: { pattern: "^[A-Za-z0-9_.-]+$", message: "Invalid token format" },
      },
      {
        key: "discord_guild_id",
        label: "Discord Server ID",
        secret: false,
        placeholder: "e.g. 123456789012345678",
        helpText: "Right-click your server name and select Copy Server ID.",
        validation: { pattern: "^\\d{17,20}$", message: "Must be a numeric server ID" },
      },
    ],
    diyCostData: {
      diyLabel: "Discord bot hosting",
      diyCostPerMonth: "$5-20/mo",
      diyCostNumeric: 1200,
      accounts: ["Discord Developer Portal"],
      apiKeys: ["Discord Bot Token"],
      hardware: "VPS or cloud server",
    },
  },
  slack: {
    configFields: [
      {
        key: "slack_bot_token",
        label: "Slack Bot Token",
        secret: true,
        placeholder: "xoxb-...",
        helpUrl: PROVIDER_DOC_URLS.slack,
        helpText: "Create a Slack app, add Bot Token Scopes, then install to workspace.",
        validation: { pattern: "^xoxb-", message: "Must start with xoxb-" },
      },
      {
        key: "slack_signing_secret",
        label: "Slack Signing Secret",
        secret: true,
        placeholder: "Paste your signing secret",
        helpText: "Found under Basic Information > App Credentials.",
      },
    ],
    diyCostData: {
      diyLabel: "Slack app hosting",
      diyCostPerMonth: "$5-20/mo",
      diyCostNumeric: 1200,
      accounts: ["Slack API Portal"],
      apiKeys: ["Slack Bot Token", "Slack Signing Secret"],
      hardware: "VPS or cloud server",
    },
  },
  telegram: {
    configFields: [
      {
        key: "telegram_bot_token",
        label: "Telegram Bot Token",
        secret: true,
        placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        helpUrl: PROVIDER_DOC_URLS.telegram,
        helpText: "Message @BotFather on Telegram with /newbot to get a token.",
        validation: { pattern: "^[0-9]+:[A-Za-z0-9_-]+$", message: "Invalid Telegram token" },
      },
    ],
    diyCostData: {
      diyLabel: "Telegram bot hosting",
      diyCostPerMonth: "$5-20/mo",
      diyCostNumeric: 1200,
      accounts: ["Telegram BotFather"],
      apiKeys: ["Telegram Bot Token"],
      hardware: "VPS or cloud server",
    },
  },
};

// Channels present in onboarding but not yet in the marketplace
const ONBOARDING_ONLY_CHANNELS: PluginOption[] = [
  {
    id: "signal",
    name: "Signal",
    description: "Connect a Signal bot for secure messaging.",
    icon: "Shield",
    color: "#3A76F0",
    capabilities: ["channel"],
    configFields: [
      {
        key: "signal_phone",
        label: "Signal Phone Number",
        secret: false,
        placeholder: "+1234567890",
        helpText: "The phone number linked to your Signal account.",
        validation: { pattern: "^\\+\\d{7,15}$", message: "Must be E.164 format" },
      },
    ],
    diyCostData: {
      diyLabel: "Signal bot hosting",
      diyCostPerMonth: "$10-30/mo",
      diyCostNumeric: 2000,
      accounts: ["Signal account"],
      apiKeys: ["Signal phone number"],
      hardware: "Dedicated server (always-on)",
    },
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect via WhatsApp Business API.",
    icon: "Phone",
    color: "#25D366",
    capabilities: ["channel"],
    configFields: [
      {
        key: "whatsapp_token",
        label: "WhatsApp API Token",
        secret: true,
        placeholder: "Paste your WhatsApp Business API token",
        helpUrl: PROVIDER_DOC_URLS.whatsapp,
        helpText: "Set up a WhatsApp Business account in Meta Developer Portal.",
      },
    ],
    diyCostData: {
      diyLabel: "WhatsApp Business API",
      diyCostPerMonth: "$15-50/mo",
      diyCostNumeric: 3000,
      accounts: ["Meta Developer Portal", "WhatsApp Business"],
      apiKeys: ["WhatsApp API Token"],
      hardware: null,
    },
  },
  {
    id: "msteams",
    name: "MS Teams",
    description: "Connect a Microsoft Teams bot.",
    icon: "Users",
    color: "#6264A7",
    capabilities: ["channel"],
    configFields: [
      {
        key: "msteams_app_id",
        label: "Teams App ID",
        secret: false,
        placeholder: "Paste your Teams app ID",
        helpUrl: PROVIDER_DOC_URLS.msTeams,
        helpText: "Register a bot in the Teams Developer Portal.",
      },
      {
        key: "msteams_app_password",
        label: "Teams App Password",
        secret: true,
        placeholder: "Paste your app password",
      },
    ],
    diyCostData: {
      diyLabel: "MS Teams bot hosting",
      diyCostPerMonth: "$10-30/mo",
      diyCostNumeric: 2000,
      accounts: ["Microsoft Azure", "Teams Developer Portal"],
      apiKeys: ["Teams App ID", "Teams App Password"],
      hardware: null,
    },
  },
];

// Static export kept for backward compat with sync callers.
// Only contains onboarding-only channels (e.g. web-ui) that don't require API data.
// For live channel data, use getChannelPlugins() which fetches from the marketplace API.
export const channelPlugins: PluginOption[] = [...ONBOARDING_ONLY_CHANNELS];

export async function getChannelPlugins(): Promise<PluginOption[]> {
  const plugins = await listMarketplacePlugins();
  const marketplaceChannels: PluginOption[] = plugins
    .filter((m) => m.category === "channel")
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      color: m.color,
      capabilities: m.capabilities,
      configFields: CHANNEL_OVERLAY[m.id]?.configFields ?? [],
      diyCostData: CHANNEL_OVERLAY[m.id]?.diyCostData,
    }));
  return [...marketplaceChannels, ...ONBOARDING_ONLY_CHANNELS];
}

// --- Providers ---

// Onboarding-specific overlay per marketplace provider plugin.
// configFields use OnboardingConfigField (with helpUrl, helpText) which differs from
// marketplace configSchema fields.
const PROVIDER_OVERLAY: Record<string, { configFields: OnboardingConfigField[] }> = {
  anthropic: {
    configFields: [
      {
        key: "anthropic_api_key",
        label: "Anthropic API Key",
        secret: true,
        placeholder: "sk-ant-...",
        helpUrl: PROVIDER_DOC_URLS.anthropic,
        helpText: "Get an API key from the Anthropic Console.",
        validation: { pattern: "^sk-ant-", message: "Must start with sk-ant-" },
      },
    ],
  },
  openai: {
    configFields: [
      {
        key: "openai_api_key",
        label: "OpenAI API Key",
        secret: true,
        placeholder: "sk-...",
        helpUrl: PROVIDER_DOC_URLS.openai,
        helpText: "Get an API key from the OpenAI dashboard.",
        validation: { pattern: "^sk-", message: "Must start with sk-" },
      },
    ],
  },
  kimi: {
    configFields: [
      {
        key: "kimi_api_key",
        label: "Kimi API Key",
        secret: true,
        placeholder: "Paste your Kimi API key",
        helpUrl: PROVIDER_DOC_URLS.moonshot,
        helpText: "Get an API key from the Moonshot Platform.",
      },
    ],
  },
  opencode: {
    configFields: [
      {
        key: "opencode_endpoint",
        label: "OpenCode Endpoint URL",
        secret: false,
        placeholder: "https://your-endpoint.example.com/v1",
        helpText: "Your OpenAI-compatible inference endpoint.",
      },
      {
        key: "opencode_api_key",
        label: "OpenCode API Key",
        secret: true,
        placeholder: "Paste your API key",
      },
    ],
  },
};

// Onboarding-specific overlay per marketplace optional plugin.
const PLUGIN_OVERLAY: Record<string, { configFields: OnboardingConfigField[] }> = {
  "elevenlabs-tts": {
    configFields: [
      {
        key: "elevenlabs_api_key",
        label: "ElevenLabs API Key",
        secret: true,
        placeholder: "Paste your ElevenLabs API key",
        helpUrl: PROVIDER_DOC_URLS.elevenlabsHome,
        helpText: "Get an API key from ElevenLabs.",
      },
    ],
  },
  "deepgram-stt": {
    configFields: [
      {
        key: "deepgram_api_key",
        label: "Deepgram API Key",
        secret: true,
        placeholder: "Paste your Deepgram API key",
        helpUrl: PROVIDER_DOC_URLS.deepgram,
        helpText: "Get an API key from Deepgram Console.",
      },
    ],
  },
  github: {
    configFields: [
      {
        key: "github_token",
        label: "GitHub Personal Access Token",
        secret: true,
        placeholder: "ghp_...",
        helpUrl: PROVIDER_DOC_URLS.github,
        helpText: "Create a fine-grained personal access token on GitHub.",
        validation: { pattern: "^gh[ps]_", message: "Must start with ghp_ or ghs_" },
      },
    ],
  },
};

export const providerPlugins: PluginOption[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models for reasoning and conversation.",
    icon: "Brain",
    color: "#D4A574",
    capabilities: ["provider"],
    configFields: [
      {
        key: "anthropic_api_key",
        label: "Anthropic API Key",
        secret: true,
        placeholder: "sk-ant-...",
        helpUrl: PROVIDER_DOC_URLS.anthropic,
        helpText: "Get an API key from the Anthropic Console.",
        validation: { pattern: "^sk-ant-", message: "Must start with sk-ant-" },
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models for text and image generation.",
    icon: "Sparkles",
    color: "#10A37F",
    capabilities: ["provider"],
    configFields: [
      {
        key: "openai_api_key",
        label: "OpenAI API Key",
        secret: true,
        placeholder: "sk-...",
        helpUrl: PROVIDER_DOC_URLS.openai,
        helpText: "Get an API key from the OpenAI dashboard.",
        validation: { pattern: "^sk-", message: "Must start with sk-" },
      },
    ],
  },
  {
    id: "kimi",
    name: "Kimi",
    description: "Moonshot AI models for long-context tasks.",
    icon: "Moon",
    color: "#6C5CE7",
    capabilities: ["provider"],
    configFields: [
      {
        key: "kimi_api_key",
        label: "Kimi API Key",
        secret: true,
        placeholder: "Paste your Kimi API key",
        helpUrl: PROVIDER_DOC_URLS.moonshot,
        helpText: "Get an API key from the Moonshot Platform.",
      },
    ],
  },
  {
    id: "opencode",
    name: "OpenCode",
    description: "Open-source compatible inference endpoint.",
    icon: "Code",
    color: "#FF6B6B",
    capabilities: ["provider"],
    configFields: [
      {
        key: "opencode_endpoint",
        label: "OpenCode Endpoint URL",
        secret: false,
        placeholder: "https://your-endpoint.example.com/v1",
        helpText: "Your OpenAI-compatible inference endpoint.",
      },
      {
        key: "opencode_api_key",
        label: "OpenCode API Key",
        secret: true,
        placeholder: "Paste your API key",
      },
    ],
  },
];

// --- Optional Plugins ---

export interface PluginCategory {
  id: string;
  name: string;
  plugins: PluginOption[];
}

export const pluginCategories: PluginCategory[] = [
  {
    id: "memory",
    name: "Memory",
    plugins: [
      {
        id: "semantic-memory",
        name: "Semantic Memory Search",
        description: "Long-term memory with vector search across conversations.",
        icon: "Database",
        color: "#8B5CF6",
        capabilities: ["memory"],
        configFields: [],
      },
    ],
  },
  {
    id: "voice",
    name: "Voice",
    plugins: [
      {
        id: "elevenlabs-tts",
        name: "ElevenLabs TTS",
        description: "High-quality text-to-speech synthesis.",
        icon: "Volume2",
        color: "#000000",
        capabilities: ["voice", "tts"],
        configFields: [
          {
            key: "elevenlabs_api_key",
            label: "ElevenLabs API Key",
            secret: true,
            placeholder: "Paste your ElevenLabs API key",
            helpUrl: PROVIDER_DOC_URLS.elevenlabsHome,
            helpText: "Get an API key from ElevenLabs.",
          },
        ],
      },
      {
        id: "deepgram-stt",
        name: "Deepgram STT",
        description: "Fast, accurate speech-to-text transcription.",
        icon: "Mic",
        color: "#13EF93",
        capabilities: ["voice", "stt"],
        configFields: [
          {
            key: "deepgram_api_key",
            label: "Deepgram API Key",
            secret: true,
            placeholder: "Paste your Deepgram API key",
            helpUrl: PROVIDER_DOC_URLS.deepgram,
            helpText: "Get an API key from Deepgram Console.",
          },
        ],
      },
      {
        id: "openai-tts",
        name: "OpenAI TTS",
        description: "Text-to-speech via OpenAI.",
        icon: "Volume2",
        color: "#10A37F",
        capabilities: ["voice", "tts"],
        requires: ["openai"],
        configFields: [],
      },
      {
        id: "discord-voice",
        name: "Discord Voice",
        description: "Join Discord voice channels for live conversation.",
        icon: "Headphones",
        color: "#5865F2",
        capabilities: ["voice", "channel-voice"],
        requires: ["discord"],
        configFields: [],
      },
    ],
  },
  {
    id: "integration",
    name: "Integration",
    plugins: [
      {
        id: "webhooks",
        name: "Webhooks",
        description: "Send and receive webhooks for external integrations.",
        icon: "Webhook",
        color: "#F59E0B",
        capabilities: ["integration"],
        configFields: [],
      },
      {
        id: "github",
        name: "GitHub",
        description: "GitHub integration for code review and issue tracking.",
        icon: "GitBranch",
        color: "#24292E",
        capabilities: ["integration"],
        configFields: [
          {
            key: "github_token",
            label: "GitHub Personal Access Token",
            secret: true,
            placeholder: "ghp_...",
            helpUrl: PROVIDER_DOC_URLS.github,
            helpText: "Create a fine-grained personal access token on GitHub.",
            validation: { pattern: "^gh[ps]_", message: "Must start with ghp_ or ghs_" },
          },
        ],
      },
    ],
  },
  {
    id: "ui",
    name: "UI",
    plugins: [
      {
        id: "web-ui",
        name: "Web UI",
        description: "Browser-based chat interface for your bot.",
        icon: "Globe",
        color: "#3B82F6",
        capabilities: ["ui"],
        configFields: [],
      },
    ],
  },
];

export async function getProviderPlugins(): Promise<PluginOption[]> {
  const plugins = await listMarketplacePlugins();
  const marketplaceProviders: PluginOption[] = plugins
    .filter((m) => m.category === "provider")
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      color: m.color,
      capabilities: m.capabilities,
      configFields: PROVIDER_OVERLAY[m.id]?.configFields ?? [],
    }));
  const marketplaceIds = new Set(marketplaceProviders.map((p) => p.id));
  const staticOnly = providerPlugins.filter((p) => !marketplaceIds.has(p.id));
  return [...marketplaceProviders, ...staticOnly];
}

export async function getOptionalPlugins(): Promise<PluginCategory[]> {
  const plugins = await listMarketplacePlugins();
  const optionalCategories = ["memory", "voice", "integration", "ui"] as const;
  const result: PluginCategory[] = [];
  for (const catId of optionalCategories) {
    const marketplaceInCat = plugins
      .filter((m) => m.category === catId)
      .map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        icon: m.icon,
        color: m.color,
        capabilities: m.capabilities,
        configFields: PLUGIN_OVERLAY[m.id]?.configFields ?? [],
      }));
    const staticCat = pluginCategories.find((c) => c.id === catId);
    const marketplaceIds = new Set(marketplaceInCat.map((p) => p.id));
    const staticOnly = (staticCat?.plugins ?? []).filter((p) => !marketplaceIds.has(p.id));
    const merged = [...marketplaceInCat, ...staticOnly];
    if (merged.length > 0) {
      result.push({
        id: catId,
        name: staticCat?.name ?? catId.charAt(0).toUpperCase() + catId.slice(1),
        plugins: merged,
      });
    }
  }
  const knownCats = new Set<string>(optionalCategories);
  const extraCats = new Set(
    plugins
      .filter(
        (m) => !knownCats.has(m.category) && m.category !== "channel" && m.category !== "provider",
      )
      .map((m) => m.category),
  );
  for (const catId of extraCats) {
    result.push({
      id: catId,
      name: catId.charAt(0).toUpperCase() + catId.slice(1),
      plugins: plugins
        .filter((m) => m.category === catId)
        .map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          icon: m.icon,
          color: m.color,
          capabilities: m.capabilities,
          configFields: [],
        })),
    });
  }
  return result;
}

// --- Presets ---

export const presets: Preset[] = [
  {
    id: "discord-ai-bot",
    name: "Discord AI Bot",
    description: "A Discord bot powered by Claude with memory.",
    channels: ["discord"],
    providers: ["anthropic"],
    plugins: ["semantic-memory"],
    keyCount: 2,
  },
  {
    id: "slack-ai-assistant",
    name: "Slack AI Assistant",
    description: "A Slack app powered by Claude with memory.",
    channels: ["slack"],
    providers: ["anthropic"],
    plugins: ["semantic-memory"],
    keyCount: 2,
  },
  {
    id: "multi-channel",
    name: "Multi-Channel",
    description: "Discord, Slack, and Telegram with Claude.",
    channels: ["discord", "slack", "telegram"],
    providers: ["anthropic"],
    plugins: ["semantic-memory"],
    keyCount: 4,
  },
  {
    id: "voice-enabled",
    name: "Voice-Enabled",
    description: "Discord bot with voice chat via ElevenLabs and Deepgram.",
    channels: ["discord"],
    providers: ["anthropic"],
    plugins: ["semantic-memory", "elevenlabs-tts", "deepgram-stt", "discord-voice"],
    keyCount: 4,
  },
  {
    id: "api-only",
    name: "API Only",
    description: "OpenAI-compatible API endpoint, no channels.",
    channels: [],
    providers: ["opencode"],
    plugins: [],
    keyCount: 1,
  },
  {
    id: "custom",
    name: "Custom",
    description: "Full wizard: pick channels, providers, and plugins.",
    channels: [],
    providers: [],
    plugins: [],
    keyCount: 0,
  },
];

// --- Model catalog ---

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  providerId: string;
  description: string;
  costPerMessage: string;
  hero: boolean;
  recommended: boolean;
  category: "reasoning" | "general" | "fast" | "code" | "vision" | "open-source";
}

export const heroModels: ModelOption[] = [
  {
    id: "anthropic/claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    provider: "Anthropic",
    providerId: "anthropic",
    description: "Best at reasoning, coding, and conversation",
    costPerMessage: "~$0.01/msg",
    hero: true,
    recommended: true,
    category: "reasoning",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    providerId: "openai",
    description: "Great all-rounder, fast and reliable",
    costPerMessage: "~$0.005/msg",
    hero: true,
    recommended: false,
    category: "general",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    provider: "Meta",
    providerId: "meta",
    description: "Open source and fast, good for simple tasks",
    costPerMessage: "~$0.001/msg",
    hero: true,
    recommended: false,
    category: "open-source",
  },
];

export const additionalModels: ModelOption[] = [
  {
    id: "anthropic/claude-opus-4-20250514",
    name: "Claude Opus 4",
    provider: "Anthropic",
    providerId: "anthropic",
    description: "Most capable, deep reasoning",
    costPerMessage: "~$0.08/msg",
    hero: false,
    recommended: false,
    category: "reasoning",
  },
  {
    id: "anthropic/claude-haiku-4-20250514",
    name: "Claude Haiku 4",
    provider: "Anthropic",
    providerId: "anthropic",
    description: "Fast and affordable",
    costPerMessage: "~$0.001/msg",
    hero: false,
    recommended: false,
    category: "fast",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    providerId: "openai",
    description: "Lightweight and fast",
    costPerMessage: "~$0.001/msg",
    hero: false,
    recommended: false,
    category: "fast",
  },
  {
    id: "openai/o3",
    name: "o3",
    provider: "OpenAI",
    providerId: "openai",
    description: "Advanced reasoning model",
    costPerMessage: "~$0.04/msg",
    hero: false,
    recommended: false,
    category: "reasoning",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    providerId: "google",
    description: "Multimodal with long context",
    costPerMessage: "~$0.01/msg",
    hero: false,
    recommended: false,
    category: "vision",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    providerId: "google",
    description: "Fast and cost-effective",
    costPerMessage: "~$0.002/msg",
    hero: false,
    recommended: false,
    category: "fast",
  },
  {
    id: "mistralai/mistral-large",
    name: "Mistral Large",
    provider: "Mistral",
    providerId: "mistral",
    description: "Strong multilingual model",
    costPerMessage: "~$0.008/msg",
    hero: false,
    recommended: false,
    category: "general",
  },
  {
    id: "mistralai/mistral-small",
    name: "Mistral Small",
    provider: "Mistral",
    providerId: "mistral",
    description: "Efficient and affordable",
    costPerMessage: "~$0.001/msg",
    hero: false,
    recommended: false,
    category: "fast",
  },
  {
    id: "cohere/command-r-plus",
    name: "Command R+",
    provider: "Cohere",
    providerId: "cohere",
    description: "Retrieval-augmented generation specialist",
    costPerMessage: "~$0.005/msg",
    hero: false,
    recommended: false,
    category: "general",
  },
  {
    id: "deepseek/deepseek-chat-v3",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    providerId: "deepseek",
    description: "Strong reasoning at low cost",
    costPerMessage: "~$0.002/msg",
    hero: false,
    recommended: false,
    category: "reasoning",
  },
  {
    id: "meta-llama/llama-3.1-8b-instruct",
    name: "Llama 3.1 8B",
    provider: "Meta",
    providerId: "meta",
    description: "Small and very fast",
    costPerMessage: "~$0.0002/msg",
    hero: false,
    recommended: false,
    category: "fast",
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B",
    provider: "Qwen",
    providerId: "qwen",
    description: "Multilingual powerhouse",
    costPerMessage: "~$0.003/msg",
    hero: false,
    recommended: false,
    category: "general",
  },
];

export const allModels: ModelOption[] = [...heroModels, ...additionalModels];

export const MODEL_COUNT = "200+";

// --- BYOK Providers ---

export interface ByokProvider {
  id: string;
  name: string;
  description: string;
  models: string;
  color: string;
}

export const byokProviders: ByokProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models directly",
    models: "Claude Opus, Sonnet, Haiku",
    color: "#D4A574",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4, o1, GPT-4o directly",
    models: "GPT-4o, o1, o3",
    color: "#10A37F",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "200+ models, one key",
    models: "All providers",
    color: "#6366F1",
  },
  {
    id: "google",
    name: "Google AI",
    description: "Gemini models directly",
    models: "Gemini 2.5 Pro, Flash",
    color: "#4285F4",
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Mistral models directly",
    models: "Large, Small, Codestral",
    color: "#FF7000",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast inference",
    models: "Llama, Mixtral",
    color: "#F55036",
  },
  {
    id: "together",
    name: "Together",
    description: "Open-source model hosting",
    models: "Llama, Qwen, Mistral",
    color: "#0066FF",
  },
];

// --- Helpers ---

export function getAllPlugins(): PluginOption[] {
  return [...channelPlugins, ...providerPlugins, ...pluginCategories.flatMap((c) => c.plugins)];
}

export function getPluginById(id: string): PluginOption | undefined {
  return getAllPlugins().find((p) => p.id === id);
}

export function collectConfigFields(
  selectedChannels: string[],
  selectedProviders: string[],
  selectedPlugins: string[],
): OnboardingConfigField[] {
  const allIds = [...selectedChannels, ...selectedProviders, ...selectedPlugins];
  const allPlugins = getAllPlugins();
  const fields: OnboardingConfigField[] = [];
  const seen = new Set<string>();

  for (const id of allIds) {
    const plugin = allPlugins.find((p) => p.id === id);
    if (!plugin) continue;
    for (const field of plugin.configFields) {
      if (!seen.has(field.key)) {
        seen.add(field.key);
        fields.push(field);
      }
    }
  }

  return fields;
}

export function resolveDependencies(
  selectedChannels: string[],
  selectedProviders: string[],
  selectedPlugins: string[],
): string[] {
  const allSelected = new Set([...selectedChannels, ...selectedProviders, ...selectedPlugins]);
  const allPlugins = getAllPlugins();
  const resolved = new Set(selectedPlugins);

  for (const pluginId of resolved) {
    const plugin = allPlugins.find((p) => p.id === pluginId);
    if (!plugin?.requires) continue;
    for (const dep of plugin.requires) {
      if (!allSelected.has(dep)) {
        // Dependency not in channels/providers, add as plugin
        resolved.add(dep);
      }
    }
  }

  return [...resolved];
}

/** Returns the config field for the shared AI key based on provider choice */
export function getAiKeyField(provider: ByokAiProvider): OnboardingConfigField {
  return provider === "openrouter" ? openrouterKeyField : openaiKeyField;
}

/** Returns superpowers that use the shared AI key */
export function getAiKeySuperpowers(selectedIds: string[]): Superpower[] {
  return superpowers.filter((sp) => selectedIds.includes(sp.id) && sp.usesAiKey);
}

/** Capability descriptions shown after key validation */
export const AI_CAPABILITY_DESCRIPTIONS: Record<
  string,
  { label: string; openai: string; openrouter: string }
> = {
  memory: {
    label: "Memory",
    openai: "Embeddings for long-term recall",
    openrouter: "Embeddings for long-term recall",
  },
  search: {
    label: "Search",
    openai: "Web and document search",
    openrouter: "Web and document search",
  },
  "text-gen": {
    label: "Text-gen",
    openai: "GPT-4o, o3 text generation",
    openrouter: "200+ AI models via OpenRouter",
  },
};

export function validateField(field: OnboardingConfigField, value: string): string | null {
  if (!value.trim()) {
    return `${field.label} is required`;
  }
  if (field.validation) {
    try {
      const regex = new RegExp(field.validation.pattern);
      if (!regex.test(value)) {
        return field.validation.message;
      }
    } catch {
      // Invalid regex in field validation config — treat as validation failure
      return field.validation.message;
    }
  }
  return null;
}
