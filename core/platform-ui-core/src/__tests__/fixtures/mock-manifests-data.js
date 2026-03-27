// Plain JS data file — no TypeScript, no imports — safe to require() inside vi.hoisted()
// This file is the single source of truth for test fixture data.

const MARKETPLACE_TEST_PLUGINS = [
  {
    id: "discord",
    name: "Discord",
    description:
      "Connect your bot instance to Discord servers. Supports text channels, threads, DMs, and slash commands.",
    version: "3.2.0",
    author: "Platform Team",
    icon: "MessageCircle",
    color: "#5865F2",
    category: "channel",
    tags: ["channel", "chat", "community"],
    capabilities: ["channel"],
    requires: [],
    install: [],
    configSchema: [
      {
        key: "botToken",
        label: "Bot Token",
        type: "string",
        required: true,
        secret: true,
        setupFlow: "paste",
        placeholder: "Paste your Discord bot token",
        description: "Found under Bot > Token in the Developer Portal.",
        validation: { pattern: "^[A-Za-z0-9_.-]+$", message: "Invalid token format" },
      },
      {
        key: "guildId",
        label: "Server ID",
        type: "string",
        required: true,
        placeholder: "e.g. 123456789012345678",
        description: "Right-click server name > Copy Server ID.",
        validation: { pattern: "^\\d{17,20}$", message: "Must be a numeric server ID" },
      },
    ],
    setup: [
      {
        id: "create-bot",
        title: "Create a Discord Bot",
        description: "Create a bot.",
        fields: [],
      },
      {
        id: "paste-token",
        title: "Enter Bot Token",
        description: "Paste the token.",
        fields: [
          {
            key: "botToken",
            label: "Bot Token",
            type: "string",
            required: true,
            secret: true,
            setupFlow: "paste",
            placeholder: "Paste your Discord bot token",
            description: "Found under Bot > Token.",
            validation: { pattern: "^[A-Za-z0-9_.-]+$", message: "Invalid token format" },
          },
        ],
      },
      { id: "done", title: "Connection Complete", description: "Ready.", fields: [] },
    ],
    connectionTest: { label: "Test Bot Connection", endpoint: "/api/channels/discord/test" },
    installCount: 12400,
    changelog: [
      { version: "3.2.0", date: "2026-02-10", notes: "Added thread support and slash commands." },
    ],
    marketplaceTab: "channel",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Connect your bot instance to Slack workspaces.",
    version: "2.1.0",
    author: "Platform Team",
    icon: "Hash",
    color: "#4A154B",
    category: "channel",
    tags: ["channel", "chat"],
    capabilities: ["channel"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [{ id: "done", title: "Ready", description: "Ready.", fields: [] }],
    connectionTest: { label: "Test Slack Connection", endpoint: "/api/channels/slack/test" },
    installCount: 8200,
    changelog: [],
    marketplaceTab: "channel",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect your bot instance to Telegram.",
    version: "1.5.0",
    author: "Platform Team",
    icon: "Send",
    color: "#0088CC",
    category: "channel",
    tags: ["channel"],
    capabilities: ["channel"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [{ id: "done", title: "Ready", description: "Ready.", fields: [] }],
    connectionTest: {
      label: "Test Telegram Connection",
      endpoint: "/api/channels/telegram/test",
    },
    installCount: 5100,
    changelog: [],
    marketplaceTab: "channel",
  },
  {
    id: "semantic-memory",
    name: "Semantic Memory",
    description: "Long-term memory with vector search.",
    version: "1.4.0",
    author: "Platform Team",
    icon: "Database",
    color: "#8B5CF6",
    category: "memory",
    tags: ["memory", "vectors"],
    capabilities: ["memory", "embeddings"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [{ id: "done", title: "Memory Ready", description: "Ready.", fields: [] }],
    installCount: 9800,
    changelog: [],
    marketplaceTab: "superpower",
    superpowerHeadline: "A Bot That Never Forgets",
    superpowerTagline: "Your bot remembers every conversation.",
    superpowerOutcomes: ["Recalls context from months ago"],
  },
  {
    id: "meeting-transcriber",
    name: "Meeting Transcriber",
    description: "Transcribe voice meetings automatically.",
    version: "1.0.0",
    author: "Platform Team",
    icon: "Mic",
    color: "#F59E0B",
    category: "voice",
    tags: ["voice", "transcription"],
    capabilities: ["stt", "llm"],
    requires: [{ id: "discord", label: "Discord (for voice channels)" }],
    install: ["discord"],
    configSchema: [],
    setup: [{ id: "done", title: "Ready", description: "Ready.", fields: [] }],
    installCount: 3200,
    changelog: [],
    marketplaceTab: "superpower",
    superpowerHeadline: "Fire Your Secretary",
    superpowerTagline: "Your bot takes meeting notes.",
    superpowerOutcomes: ["Auto-transcribed meetings"],
  },
  {
    id: "webhooks",
    name: "Webhooks",
    description: "Send and receive webhooks.",
    version: "1.1.0",
    author: "Platform Team",
    icon: "Webhook",
    color: "#F59E0B",
    category: "webhook",
    tags: ["webhook"],
    capabilities: ["webhook"],
    requires: [],
    install: [],
    configSchema: [
      {
        key: "secret",
        label: "Webhook Secret",
        type: "string",
        required: false,
        secret: true,
        placeholder: "Optional",
      },
    ],
    setup: [
      { id: "configure", title: "Configure Webhooks", description: "Set up.", fields: [] },
      { id: "done", title: "Webhooks Ready", description: "Ready.", fields: [] },
    ],
    installCount: 7100,
    changelog: [],
    marketplaceTab: "utility",
  },
  {
    id: "deepgram-stt",
    name: "Deepgram STT",
    description: "Speech-to-text powered by Deepgram.",
    version: "1.0.0",
    author: "Platform Team",
    icon: "Mic",
    color: "#6366F1",
    category: "voice",
    tags: ["stt", "voice"],
    capabilities: ["stt"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [{ id: "done", title: "Ready", description: "Ready.", fields: [] }],
    installCount: 4500,
    changelog: [],
    marketplaceTab: "capability",
  },
];

// webhooks at index 0, meeting-transcriber at index 1 — order is load-bearing for plugin-install-flow tests
const INSTALL_FLOW_TEST_PLUGINS = [
  MARKETPLACE_TEST_PLUGINS[5], // webhooks
  MARKETPLACE_TEST_PLUGINS[4], // meeting-transcriber
];

function findManifest(id) {
  const m = MARKETPLACE_TEST_PLUGINS.find((p) => p.id === id);
  if (!m) throw new Error(`Manifest ${id} not found in MARKETPLACE_TEST_PLUGINS`);
  return m;
}

const DISCORD_MANIFEST = {
  id: "discord",
  name: "Discord",
  description: "Connect to Discord.",
  icon: "MessageCircle",
  color: "#5865F2",
  setup: [
    {
      id: "create-bot",
      title: "Create a Discord Bot",
      description: "Visit the Developer Portal and create a bot.",
      instruction: "Go to the Discord Developer Portal",
      externalUrl: "https://discord.com/developers/applications",
      fields: [],
    },
    {
      id: "paste-token",
      title: "Enter Bot Token",
      description: "Paste the bot token.",
      fields: [
        {
          key: "botToken",
          label: "Bot Token",
          type: "string",
          required: true,
          secret: true,
          setupFlow: "paste",
          placeholder: "Paste your Discord bot token",
          description: "Found under Bot > Token.",
          validation: { pattern: "^[A-Za-z0-9_.-]+$", message: "Invalid token format" },
        },
      ],
    },
    {
      id: "select-guild",
      title: "Select Server",
      description: "Choose your server.",
      fields: [
        {
          key: "guildId",
          label: "Server",
          type: "select",
          required: true,
          setupFlow: "interactive",
          options: [
            { label: "Platform HQ", value: "1234567890" },
            { label: "Test Server", value: "0987654321" },
          ],
        },
      ],
    },
    {
      id: "done",
      title: "Connection Complete",
      description: "Your bot is ready to use.",
      fields: [],
    },
  ],
  connectionTest: { label: "Test Bot Connection", endpoint: "/api/channels/discord/test" },
};

const TELEGRAM_MANIFEST = {
  id: "telegram",
  name: "Telegram",
  description: "Connect to Telegram.",
  icon: "Send",
  color: "#0088CC",
  setup: [
    {
      id: "create-bot",
      title: "Create a Telegram Bot",
      description: "Use BotFather to create your bot.",
      fields: [],
    },
    {
      id: "paste-token",
      title: "Enter Bot Token",
      description: "Paste the token from BotFather.",
      fields: [
        {
          key: "botToken",
          label: "Bot Token",
          type: "string",
          required: true,
          secret: true,
          setupFlow: "paste",
          placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
          description: "Issued by BotFather.",
          validation: {
            pattern: "^\\d+:[A-Za-z0-9_-]{35,}$",
            message: "Invalid Telegram bot token format",
          },
        },
      ],
    },
    {
      id: "done",
      title: "Connection Complete",
      description: "Your Telegram bot is ready.",
      fields: [],
    },
  ],
  connectionTest: { label: "Test Telegram Connection", endpoint: "/api/channels/telegram/test" },
};

const SLACK_MANIFEST = {
  id: "slack",
  name: "Slack",
  description: "Connect to Slack.",
  icon: "Hash",
  color: "#4A154B",
  setup: [
    {
      id: "oauth",
      title: "Authorize Slack",
      description: "Sign in with Slack.",
      fields: [
        {
          key: "slackToken",
          label: "Slack Token",
          type: "string",
          required: true,
          setupFlow: "oauth",
        },
      ],
    },
    {
      id: "done",
      title: "Connected",
      description: "Slack is ready.",
      fields: [],
    },
  ],
  connectionTest: { label: "Test Slack Connection", endpoint: "/api/channels/slack/test" },
};

const CHANNEL_MANIFESTS_FIXTURE = [DISCORD_MANIFEST, SLACK_MANIFEST, TELEGRAM_MANIFEST];

module.exports = {
  MARKETPLACE_TEST_PLUGINS,
  INSTALL_FLOW_TEST_PLUGINS,
  findManifest,
  DISCORD_MANIFEST,
  TELEGRAM_MANIFEST,
  SLACK_MANIFEST,
  CHANNEL_MANIFESTS_FIXTURE,
};
