import type { Page } from "@playwright/test";

const PLATFORM_BASE_URL = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_BASE_URL = `${PLATFORM_BASE_URL}/api`;

/** Stateful mock — POST handlers mutate state so subsequent GETs reflect changes. */
export interface FleetMockState {
  bots: Array<{
    id: string;
    name: string;
    state: string;
    env: Record<string, string>;
    uptime: string;
    createdAt: string;
    stats: {
      cpuPercent: number;
      memoryUsageMb: number;
      memoryLimitMb: number;
      memoryPercent: number;
    } | null;
  }>;
  installedPlugins: Map<string, Array<{ pluginId: string; enabled: boolean }>>;
  connectedChannels: Map<string, Array<{ id: string; name: string; type: string; status: string }>>;
  secrets: Record<string, Record<string, string>>;
}

export function createFleetMockState(): FleetMockState {
  return {
    bots: [],
    installedPlugins: new Map(),
    connectedChannels: new Map(),
    secrets: {},
  };
}

export const DISCORD_MANIFEST = {
  id: "discord",
  name: "Discord",
  description: "Connect your WOPR instance to Discord servers.",
  version: "3.2.0",
  author: "WOPR Team",
  icon: "MessageCircle",
  color: "#5865F2",
  category: "channel",
  tags: ["channel", "chat", "community"],
  capabilities: ["channel"],
  requires: [],
  install: [],
  configSchema: [],
  setup: [{ id: "done", title: "Connection Complete", description: "Ready.", fields: [] }],
  installCount: 12400,
  changelog: [],
  marketplaceTab: "superpower",
  superpowerHeadline: "Discord Integration",
  superpowerTagline: "Connect to Discord servers",
};

export const SLACK_MANIFEST = {
  id: "slack",
  name: "Slack",
  description: "Connect your WOPR instance to Slack workspaces.",
  version: "2.1.0",
  author: "WOPR Team",
  icon: "Hash",
  color: "#4A154B",
  category: "channel",
  tags: ["channel", "chat", "workspace"],
  capabilities: ["channel"],
  requires: [],
  install: [],
  configSchema: [],
  setup: [{ id: "done", title: "Connection Complete", description: "Ready.", fields: [] }],
  installCount: 8200,
  changelog: [],
  marketplaceTab: "superpower",
  superpowerHeadline: "Slack Integration",
  superpowerTagline: "Connect to Slack workspaces",
};

export const TELEGRAM_MANIFEST = {
  id: "telegram",
  name: "Telegram",
  description: "Connect your WOPR instance to Telegram.",
  version: "1.5.0",
  author: "WOPR Team",
  icon: "Send",
  color: "#0088CC",
  category: "channel",
  tags: ["channel"],
  capabilities: ["channel"],
  requires: [],
  install: [],
  configSchema: [],
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
  connectionTest: {
    label: "Test Telegram Connection",
    endpoint: "/api/channels/telegram/test",
  },
  installCount: 5100,
  changelog: [],
  marketplaceTab: "channel",
};

let _botCounter = 0;

/** Helper to create a full bot object with defaults for the expanded type. */
function makeBotEntry(partial: { id: string; name: string; state: string }) {
  return {
    id: partial.id,
    name: partial.name,
    state: partial.state,
    env: {} as Record<string, string>,
    uptime: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    stats: { cpuPercent: 12, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
  };
}

export async function mockFleetAPI(page: Page, state: FleetMockState) {
  // Backfill any bots that were added with the short shape (e.g. from tests)
  for (let i = 0; i < state.bots.length; i++) {
    const b = state.bots[i];
    if (!("env" in b)) {
      state.bots[i] = makeBotEntry(b as { id: string; name: string; state: string });
    }
  }

  // tRPC fleet.createInstance (POST) — must be registered before batch routes
  await page.route(`${PLATFORM_BASE_URL}/trpc/fleet.createInstance**`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    // tRPC v11 httpBatchLink sends POST body as {"0": {input}} (no "json" wrapper).
    const body = route.request().postDataJSON() as Record<string, { name?: string }> | null;
    const input = body?.["0"];
    const botName = input?.name ?? "e2e-test-bot";
    const botId = `e2e-bot-${++_botCounter}`;
    const newBot = makeBotEntry({ id: botId, name: botName, state: "running" });
    state.bots.push(newBot);
    state.installedPlugins.set(botId, []);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          result: { data: { id: botId, name: botName } },
        },
      ]),
    });
  });

  // tRPC fleet.getInstance (GET batch)
  await page.route(`${PLATFORM_BASE_URL}/trpc/fleet.getInstance**`, async (route) => {
    const url = new URL(route.request().url());
    const inputParam = url.searchParams.get("input");
    let botId = "";
    try {
      const parsed = JSON.parse(inputParam ?? "{}");
      // tRPC v11 httpBatchLink: input is {"0": {id}} (no "json" wrapper)
      botId = parsed?.["0"]?.id ?? parsed?.["0"]?.json?.id ?? "";
    } catch {
      /* ignore */
    }
    const bot = state.bots.find((b) => b.id === botId);
    if (!bot) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ result: { data: null } }]),
      });
      return;
    }
    const plugins = state.installedPlugins.get(botId) ?? [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          result: {
            data: {
              id: bot.id,
              name: bot.name,
              state: bot.state,
              env: bot.env,
              uptime: bot.uptime,
              createdAt: bot.createdAt,
              stats: bot.stats,
              plugins: plugins.map((p) => ({
                id: p.pluginId,
                name: p.pluginId,
                version: "1.0.0",
                enabled: p.enabled,
              })),
            },
          },
        },
      ]),
    });
  });

  // tRPC fleet.controlInstance (POST)
  await page.route(`${PLATFORM_BASE_URL}/trpc/fleet.controlInstance**`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    // tRPC v11 httpBatchLink: POST body is {"0": {id, action}} (no "json" wrapper)
    const body = route.request().postDataJSON() as Record<
      string,
      { id: string; action: string }
    > | null;
    const input = body?.["0"];
    const botId = input?.id ?? "";
    const action = input?.action ?? "";
    const bot = state.bots.find((b) => b.id === botId);
    if (bot) {
      if (action === "stop") bot.state = "exited";
      else if (action === "start" || action === "restart") bot.state = "running";
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ result: { data: { success: true } } }]),
    });
  });

  // tRPC fleet.getInstanceHealth (GET)
  await page.route(`${PLATFORM_BASE_URL}/trpc/fleet.getInstanceHealth**`, async (route) => {
    const url = new URL(route.request().url());
    const inputParam = url.searchParams.get("input");
    let botId = "";
    try {
      const parsed = JSON.parse(inputParam ?? "{}");
      botId = parsed?.["0"]?.id ?? parsed?.["0"]?.json?.id ?? "";
    } catch {
      /* ignore */
    }
    const bot = state.bots.find((b) => b.id === botId);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          result: {
            data: {
              id: botId,
              state: bot?.state ?? "running",
              health: "healthy",
              uptime: bot?.uptime ?? new Date().toISOString(),
              stats: bot?.stats ?? { cpuPercent: 10, memoryUsageMb: 128 },
            },
          },
        },
      ]),
    });
  });

  // tRPC fleet.getInstanceMetrics (GET)
  await page.route(`${PLATFORM_BASE_URL}/trpc/fleet.getInstanceMetrics**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          result: {
            data: {
              id: "mock",
              stats: { cpuPercent: 12, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
            },
          },
        },
      ]),
    });
  });

  // tRPC fleet.getInstanceLogs (GET)
  await page.route(`${PLATFORM_BASE_URL}/trpc/fleet.getInstanceLogs**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          result: {
            data: { logs: ["2026-03-05T00:00:00Z [INFO] Bot started successfully"] },
          },
        },
      ]),
    });
  });

  // Fleet REST: PATCH /fleet/bots/:id (update config)
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots/*`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const match = url.match(/\/fleet\/bots\/([^/?]+)/);
    const botId = match?.[1] ?? "";
    const body = route.request().postDataJSON() as { env?: Record<string, string> } | null;
    const bot = state.bots.find((b) => b.id === botId);
    if (bot && body?.env) {
      bot.env = { ...bot.env, ...body.env };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // Fleet REST: GET/PUT /fleet/bots/:id/secrets
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots/*/secrets`, async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    const match = url.match(/\/fleet\/bots\/([^/]+)\/secrets/);
    const botId = match?.[1] ?? "";

    if (method === "GET") {
      const botSecrets = state.secrets[botId] ?? {};
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ keys: Object.keys(botSecrets) }),
      });
    } else if (method === "PUT") {
      const body = route.request().postDataJSON() as Record<string, string> | null;
      if (body) {
        state.secrets[botId] = { ...state.secrets[botId], ...body };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.continue();
    }
  });

  // tRPC fleet.listInstances (GET)
  await page.route(`${PLATFORM_BASE_URL}/trpc/fleet.listInstances**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          result: { data: { bots: state.bots } },
        },
      ]),
    });
  });

  // Fleet REST: GET /api/fleet/bots (used by marketplace page via apiFetch)
  await page.route(`${API_BASE_URL}/fleet/bots`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        state.bots.map((b) => ({ id: b.id, name: b.name, state: b.state })),
      ),
    });
  });

  // Fleet REST: GET /fleet/bots (used by marketplace listBots via fleetFetch)
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        bots: state.bots.map((b) => ({ id: b.id, name: b.name, state: b.state })),
      }),
    });
  });

  // Fleet REST: POST/DELETE /fleet/bots/:id/plugins/:pluginId
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots/*/plugins/*`, async (route) => {
    const method = route.request().method();
    if (method !== "POST" && method !== "DELETE") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const match = url.match(/\/fleet\/bots\/([^/]+)\/plugins\/([^/?]+)/);
    const botId = match?.[1] ?? "";
    const pluginId = match?.[2] ?? "";

    if (method === "DELETE") {
      const plugins = state.installedPlugins.get(botId) ?? [];
      state.installedPlugins.set(
        botId,
        plugins.filter((p) => p.pluginId !== pluginId),
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    // POST (install)
    const plugins = state.installedPlugins.get(botId) ?? [];
    plugins.push({ pluginId, enabled: true });
    state.installedPlugins.set(botId, plugins);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        botId,
        pluginId,
        dispatched: true,
        installedPlugins: plugins.map((p) => p.pluginId),
      }),
    });
  });

  // Fleet REST: DELETE /api/fleet/bots/:id/plugins/:pluginId (used by uninstallPlugin via apiFetchRaw)
  await page.route(`${API_BASE_URL}/fleet/bots/*/plugins/*`, async (route) => {
    const method = route.request().method();
    if (method !== "DELETE") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const match = url.match(/\/fleet\/bots\/([^/]+)\/plugins\/([^/?]+)/);
    const botId = match?.[1] ?? "";
    const pluginId = match?.[2] ?? "";
    const plugins = state.installedPlugins.get(botId) ?? [];
    state.installedPlugins.set(
      botId,
      plugins.filter((p) => p.pluginId !== pluginId),
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // Fleet REST: GET /fleet/bots/:id/plugins
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots/*/plugins`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const match = url.match(/\/fleet\/bots\/([^/]+)\/plugins/);
    const botId = match?.[1] ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        botId,
        plugins: state.installedPlugins.get(botId) ?? [],
      }),
    });
  });

  // API: GET /api/marketplace/plugins (list)
  await page.route(`${API_BASE_URL}/marketplace/plugins`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([DISCORD_MANIFEST, SLACK_MANIFEST, TELEGRAM_MANIFEST]),
    });
  });

  // API: GET /api/marketplace/plugins/*/content
  await page.route(`${API_BASE_URL}/marketplace/plugins/*/content`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        markdown: "Plugin content placeholder.",
        source: "manifest_description",
        version: "1.0.0",
      }),
    });
  });

  // API: GET /api/marketplace/plugins/discord (detail)
  await page.route(`${API_BASE_URL}/marketplace/plugins/discord`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DISCORD_MANIFEST),
    });
  });

  // API: GET /api/marketplace/plugins/slack (detail)
  await page.route(`${API_BASE_URL}/marketplace/plugins/slack`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SLACK_MANIFEST),
    });
  });

  // API: GET /api/marketplace/plugins/telegram (detail)
  await page.route(`${API_BASE_URL}/marketplace/plugins/telegram`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(TELEGRAM_MANIFEST),
    });
  });

  // API: POST /api/channels/telegram/test (connectionTest endpoint declared in TELEGRAM_MANIFEST)
  await page.route(`${API_BASE_URL}/channels/telegram/test`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "Telegram connection test successful." }),
    });
  });

  // tRPC: capabilityMeta (used by install wizard's useCapabilityMeta hook)
  await page.route(
    (url) =>
      url.href.includes(PLATFORM_BASE_URL) &&
      url.pathname.startsWith("/trpc/") &&
      url.pathname.includes("capabilit"),
    async (route) => {
      const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
      const results = procs.map(() => ({ result: { data: [] } }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(results),
      });
    },
  );

  // Fleet REST: GET /fleet/bots/:id/settings (used by bot-settings page)
  await page.route(`${API_BASE_URL}/fleet/bots/*/settings`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const match = url.match(/\/fleet\/bots\/([^/]+)\/settings/);
    const botId = match?.[1] ?? "";
    const bot = state.bots.find((b) => b.id === botId);
    const installed = state.installedPlugins.get(botId) ?? [];
    const allManifests = [DISCORD_MANIFEST, SLACK_MANIFEST, TELEGRAM_MANIFEST];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: botId,
        name: bot?.name ?? "unknown",
        state: bot?.state ?? "stopped",
        status: bot?.state ?? "stopped",
        identity: { name: bot?.name ?? "unknown", personality: "default" },
        brain: { provider: "openai", model: "gpt-4" },
        channels: state.connectedChannels.get(botId) ?? [],
        installedPlugins: installed.map((p) => {
          const manifest = allManifests.find((m) => m.id === p.pluginId);
          return {
            id: p.pluginId,
            name: manifest?.name ?? p.pluginId,
            description: manifest?.description ?? "",
            icon: manifest?.icon ?? "Package",
            status: p.enabled ? "active" : "disabled",
            capabilities: manifest?.capabilities ?? [],
          };
        }),
        discoverPlugins: [],
      }),
    });
  });

  // Fleet REST: GET /fleet/bots/:id/status (used by bot-settings)
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots/*/status`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const match = url.match(/\/fleet\/bots\/([^/]+)\/status/);
    const botId = match?.[1] ?? "";
    const bot = state.bots.find((b) => b.id === botId);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: bot?.state ?? "stopped" }),
    });
  });

  // Fleet REST: GET /fleet/bots/:id/health (used by bot-settings)
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots/*/health`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ healthy: true, checks: [] }),
    });
  });

  // Fleet REST: GET /fleet/bots/:id/image-status (used by bot-settings page)
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots/*/image-status`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ready", progress: 100 }),
    });
  });

  // Fleet REST: POST /fleet/bots/:id/channels/:pluginId (connectChannel)
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots/*/channels/*`, async (route) => {
    const method = route.request().method();
    if (method !== "POST") {
      await route.continue();
      return;
    }
    const url = route.request().url();
    const match = url.match(/\/fleet\/bots\/([^/]+)\/channels\/([^/?]+)/);
    const botId = match?.[1] ?? "";
    const pluginId = match?.[2] ?? "";
    const channel = { id: `ch-${pluginId}`, name: pluginId, type: pluginId, status: "connected" };
    const channels = state.connectedChannels.get(botId) ?? [];
    if (!channels.some((c) => c.type === pluginId)) {
      channels.push(channel);
    }
    state.connectedChannels.set(botId, channels);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(channel),
    });
  });

  // Fleet SSE endpoint — return empty event stream
  await page.route(`${PLATFORM_BASE_URL}/fleet/events**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "data: {}\n\n",
    });
  });
}
