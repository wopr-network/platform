# WOPR Plugin Development Guide

Everything you need to build a first-class WOPR plugin — repo setup, CI, storage, events, hooks, manifest, capabilities, timers, and publication.

**Reference implementations:**
- `wopr-network/wopr-plugin-discord` — channel provider, channel commands, config schema, CLI commands, hooks
- `wopr-network/wopr-plugin-memory-semantic` — storage, event bus, A2A tools, extensions, WebMCP tools, context providers
- `wopr-network/wopr-plugin-skills` — context providers, A2A tools, REST router extension, storage schema
- `wopr-network/wopr-plugin-imagegen` — manifest, capability declaration, channel commands
- `wopr-network/wopr-plugin-cron` — timer pattern, A2A tools, background work
- `wopr-network/wopr-plugin-p2p` — UI component, WebUI extension, CLI commands, inter-plugin extension
- `wopr-network/wopr-plugin-provider-openai` — LLM provider registration, manifest with `provides.capabilities`

---

## 1. Repo Setup

**Plugins are ALWAYS separate repos. Never a monorepo subdirectory.**

```bash
# Repo name pattern
wopr-network/wopr-plugin-<name>

# npm package name
@wopr-network/wopr-plugin-<name>
```

Create the repo under `wopr-network/` org. Use `wopr-plugin-discord` as the template.

### Directory structure

```
wopr-plugin-<name>/
  src/
    index.ts              # Plugin definition + init/shutdown (orchestration only)
    <name>-schema.ts      # PluginSchema (if storage needed)
    <name>-repository.ts  # Repository wrapper (if storage needed)
    a2a-tools.ts          # A2A tool definitions (if registering tools)
    routes.ts             # Hono router (if exposing REST endpoints)
    types.ts              # Re-export WOPRPlugin, WOPRPluginContext from plugin-types
  tests/
    *.test.ts
  .github/
    workflows/
      ci.yml
      publish.yml
  package.json
  tsconfig.json
  biome.json
  CLAUDE.md
```

---

## 2. Plugin Interface

Every plugin exports a **single default `WOPRPlugin` object**. There is no alternative export pattern.

```typescript
import type { WOPRPlugin, WOPRPluginContext } from "@wopr-network/plugin-types";

// Module-level state — null until init()
let ctx: WOPRPluginContext | null = null;
const cleanups: Array<() => void> = [];

const plugin: WOPRPlugin = {
  name: "@wopr-network/wopr-plugin-<name>",
  version: "1.0.0",
  description: "One-line description",

  // Declarative manifest — platform uses this for capability routing, discovery, UI
  manifest: { /* see §3 */ },

  // Optional: CLI subcommands exposed via `wopr <name> <subcommand>`
  commands: [
    {
      name: "<name>",
      description: "Plugin commands",
      usage: "wopr <name> <subcommand>",
      async handler(_context: WOPRPluginContext, args: string[]) {
        // Use console.log here (not ctx.log) — these run outside the daemon
        const [sub] = args;
        if (sub === "status") {
          console.log("...");
          process.exit(0);
        }
        process.exit(sub ? 1 : 0);
      },
    },
  ],

  async init(context: WOPRPluginContext) {
    ctx = context;

    // 1. Register config schema
    ctx.registerConfigSchema("wopr-plugin-<name>", configSchema);

    // 2. Register storage schema (if needed)
    await ctx.storage.register(myPluginSchema);

    // 3. Subscribe to events — store cleanup functions
    cleanups.push(ctx.events.on("session:afterInject", async (payload) => { /* ... */ }));

    // 4. Register hooks (can transform/block)
    const handler: MessageIncomingHandler = async (event) => { /* ... */ };
    ctx.hooks.on("message:incoming", handler, { priority: 50 });
    cleanups.push(() => ctx!.hooks.off("message:incoming", handler));

    // 5. Register context provider (injects into system prompt)
    ctx.registerContextProvider({
      name: "<name>",
      priority: 10,
      enabled: true,
      async getContext() {
        const content = await buildContextContent();
        if (!content) return null;
        return { content, role: "system" as const, metadata: { source: "<name>" } };
      },
    });

    // 6. Register channel provider (if this plugin IS a channel)
    ctx.registerChannelProvider(myChannelProvider);

    // 7. Register extension (exposes API to other plugins)
    ctx.registerExtension("<name>", myExtension);

    // 8. Register A2A tools — ALWAYS guard; older WOPR versions may not have it
    if (ctx.registerA2AServer) {
      ctx.registerA2AServer({ name: "<name>", version: "1.0", tools: [ /* ... */ ] });
    }

    ctx.log.info("Plugin initialized");
  },

  async shutdown() {
    // Call all cleanup/unsubscribe functions
    for (const cleanup of cleanups) { try { cleanup(); } catch {} }
    cleanups.length = 0;

    // Reverse every registration from init()
    ctx?.unregisterConfigSchema("wopr-plugin-<name>");
    ctx?.unregisterContextProvider("<name>");
    ctx?.unregisterChannelProvider("<name>");
    ctx?.unregisterExtension("<name>");

    ctx = null;
  },
};

export default plugin;
```

**Rules:**
- `catch (error: unknown)` everywhere — **never** `catch (error: any)`
- `shutdown()` must be idempotent (safe to call twice)
- Null-check `ctx` before every use in shutdown

---

## 3. Manifest (`PluginManifest`)

```typescript
import type { PluginManifest } from "@wopr-network/plugin-types";

const manifest: PluginManifest = {
  name: "@wopr-network/wopr-plugin-<name>",
  version: "1.0.0",
  description: "One-line description",
  author: "wopr-network",
  license: "MIT",
  repository: "https://github.com/wopr-network/wopr-plugin-<name>",
  homepage: "https://github.com/wopr-network/wopr-plugin-<name>#readme",

  // What this plugin IS (for marketplace/filtering)
  capabilities: ["channel"],  // e.g. "channel" | "provider" | "memory" | "cron" | "utility"
  category: "communication",  // "creative" | "communication" | "ai-provider" | "utilities" | ...
  tags: ["<name>", "keyword"],
  icon: "🔌",

  // Runtime requirements — checked before plugin can activate
  requires: {
    bins: ["ffmpeg"],                          // executables (checked via `which`)
    env: ["API_KEY"],                          // required env vars
    docker: ["my-image:latest"],               // required docker images
    config: ["discord.token"],                 // required config keys (dot-notation)
    os: ["linux", "darwin"],                   // omit = all platforms
    node: ">=20.0.0",                          // semver range
    network: {
      outbound: true,
      inbound: true,
      p2p: false,
      ports: [7438],
      hosts: ["api.example.com"],
    },
    storage: { persistent: true, estimatedSize: "50MB" },
    services: ["redis"],
  },

  // Capabilities this plugin provides — auto-registered in capability registry on load
  provides: {
    capabilities: [
      {
        type: "tts",                           // abstract capability type
        id: "my-tts-provider",                 // unique provider ID
        displayName: "My TTS Provider",
        tier: "byok",                          // "wopr" | "branded" | "byok" — DEPRECATED (WOP-752)
        configSchema: { title: "TTS Config", fields: [/* API key field */] },
      },
    ],
  },

  // How to install missing dependencies (ordered by preference)
  install: [
    { kind: "brew", formula: "ffmpeg", label: "Install ffmpeg" },
    { kind: "apt", package: "ffmpeg", label: "Install ffmpeg" },
    { kind: "docker", image: "my-image", tag: "latest" },
  ],

  // Setup wizard steps for first-time configuration
  setup: [
    {
      id: "credentials",
      title: "API Credentials",
      description: "Enter your API key from the [dashboard](https://example.com).",
      fields: { title: "Credentials", fields: [/* ConfigField[] */] },
    },
  ],

  // Config schema — mirrors what's registered at runtime in init()
  // Must stay in sync with the runtime configSchema
  configSchema: { title: "My Plugin", fields: [/* see §4 */] },

  // Lifecycle behavior
  lifecycle: {
    healthEndpoint: "/healthz",                // relative to plugin's HTTP base
    healthIntervalMs: 30_000,
    hotReload: false,
    shutdownBehavior: "drain",                 // "graceful" | "immediate" | "drain"
    shutdownTimeoutMs: 30_000,
  },

  minCoreVersion: "1.0.0",
  dependencies: ["@wopr-network/wopr-plugin-other"],
  conflicts: ["@wopr-network/wopr-plugin-incompatible"],
};
```

> **tier values**: `"wopr"` | `"branded"` | `"byok"` — **deprecated** (WOP-752). This field will be removed from `ManifestProviderEntry`. Do not add it to new plugins; omit it if possible.

---

## 4. Config Schema

```typescript
import type { ConfigSchema } from "@wopr-network/plugin-types";

const configSchema: ConfigSchema = {
  title: "My Plugin",
  description: "Configure the plugin",
  fields: [
    {
      name: "apiKey",
      type: "password",
      label: "API Key",
      placeholder: "sk-...",
      required: true,
      secret: true,              // encrypted at rest, masked in UI
      description: "Your API key from the dashboard",
      setupFlow: "paste",        // "paste" | "oauth" | "qr" | "interactive" | "none"
    },
    {
      name: "oauthToken",
      type: "text",
      label: "OAuth Token",
      setupFlow: "oauth",
      oauthProvider: "discord",  // platform launches OAuth flow
    },
    {
      name: "mode",
      type: "select",
      label: "Mode",
      options: [{ value: "fast", label: "Fast" }, { value: "accurate", label: "Accurate" }],
      default: "fast",
      setupFlow: "none",
    },
    {
      name: "maxRetries",
      type: "number",
      label: "Max Retries",
      default: 3,
    },
    // Hidden internal fields (suppressed from config UI)
    // @ts-expect-error hidden not in shared ConfigField yet
    { name: "internalState", type: "object", label: "Internal", hidden: true, default: {} },
  ],
};

// In init():
ctx.registerConfigSchema("wopr-plugin-<name>", configSchema);
// In shutdown():
ctx.unregisterConfigSchema("wopr-plugin-<name>");

// Read config at any time:
const config = ctx.getConfig<{ apiKey?: string; mode?: string }>();
```

**setupFlow values:**
| Value | When to use |
|-------|-------------|
| `"paste"` | User types/pastes a token (default for text/password) |
| `"oauth"` | Platform launches OAuth browser flow; set `oauthProvider` too |
| `"qr"` | Platform displays QR code user scans (e.g., WhatsApp, iMessage) |
| `"interactive"` | Plugin drives its own multi-step wizard |
| `"none"` | Auto-derived or has a default; no user input needed |

---

## 5. Storage Pattern

**Plugins NEVER use Drizzle directly.** Use the `PluginSchema` + `Repository` abstraction.

### Define schema (`src/<name>-schema.ts`)

```typescript
import type { PluginSchema } from "@wopr-network/plugin-types";
import { z } from "zod";

export const MyRecordSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  content: z.string(),
  createdAt: z.number(),
});

export type MyRecord = z.infer<typeof MyRecordSchema>;

export const myPluginSchema: PluginSchema = {
  namespace: "<name>",      // unique across all plugins
  version: 1,               // bump to trigger migration
  tables: {
    records: {
      schema: MyRecordSchema,
      primaryKey: "id",
      indexes: [
        { fields: ["sessionId"] },
        { fields: ["createdAt"] },
      ],
    },
  },
};
```

### Repository wrapper (`src/<name>-repository.ts`)

```typescript
import type { Repository, StorageApi } from "@wopr-network/plugin-types";
import { myPluginSchema, type MyRecord } from "./<name>-schema.js";

let repo: Repository<MyRecord> | null = null;

export async function initStorage(storage: StorageApi): Promise<void> {
  await storage.register(myPluginSchema);
  repo = storage.getRepository<MyRecord>("<name>", "records");
}

export async function save(record: MyRecord): Promise<MyRecord> {
  return repo!.insert(record);
}

export async function findBySession(sessionId: string): Promise<MyRecord[]> {
  return repo!.findMany({ sessionId });
}

export async function deleteRecord(id: string): Promise<boolean> {
  return repo!.delete(id);
}
```

**No `drizzle.config.ts`. No `drizzle/migrations/`. No `better-sqlite3`. Core handles it.**

Raw SQL is available but treat it as a last resort:
```typescript
// SAFE — always use params, never interpolate user input
const rows = await repo.raw("SELECT * FROM records WHERE content LIKE ?", [`%${term}%`]);
```

---

## 6. Event Bus

Typed reactive events. Store every cleanup function returned by `events.on()` and call them all in `shutdown()`.

```typescript
// Returns unsubscribe function — store it
const unsub = ctx.events.on("session:afterInject", async ({ session, response }) => {
  ctx.log.info(`Session ${session} responded`);
});
cleanups.push(unsub);

// One-shot
ctx.events.once("plugin:activated", ({ plugin }) => {
  ctx.log.info(`${plugin} is ready`);
});

// Emit custom events
await ctx.events.emitCustom("my-plugin:thing-happened", { data: "..." });
```

### Core event map

| Event | Payload | When |
|-------|---------|------|
| `session:create` | `{ session, config? }` | New session started |
| `session:beforeInject` | `{ session, message, from, channel? }` | Before message processed |
| `session:afterInject` | `{ session, message, response, from }` | After response generated |
| `session:responseChunk` | `{ session, chunk, response }` | Streaming chunk |
| `session:destroy` | `{ session, history, reason? }` | Session ended |
| `channel:message` | `{ channel, message, from, metadata? }` | Raw channel message |
| `channel:send` | `{ channel, content }` | Outgoing message |
| `config:change` | `{ key, oldValue, newValue, plugin? }` | Config updated |
| `memory:filesChanged` | `{ changes[] }` | Memory files changed |
| `memory:search` | `{ query, maxResults, minScore, sessionName, results }` | Semantic search (mutable `results`) |
| `capability:providerRegistered` | `{ capability, providerId }` | New capability available |
| `plugin:activated` | `{ plugin, version }` | Plugin came online |
| `plugin:deactivated` | `{ plugin, version, drained }` | Plugin went offline |

---

## 7. Hooks

Hooks intercept core lifecycle events and can **transform or block** them. Events are read-only.

```typescript
import type { MessageIncomingHandler } from "@wopr-network/plugin-types";

const handler: MessageIncomingHandler = async (event) => {
  if (event.data.message.startsWith("!ignore")) {
    event.preventDefault();  // block — message never reaches the AI
    return;
  }
  event.data.message = event.data.message.replace(/badword/g, "***");
};

// In init():
ctx.hooks.on("message:incoming", handler, {
  priority: 50,   // lower = runs earlier (default: 100)
  name: "my-filter",
});
cleanups.push(() => ctx!.hooks.off("message:incoming", handler));
```

| Hook | Mutable? | Use case |
|------|----------|----------|
| `message:incoming` | Yes | Filter/transform inbound messages |
| `message:outgoing` | Yes | Sanitize/transform outbound responses |
| `channel:message` | Yes | Pre-process raw channel input |
| `session:create` | No | Set up per-session state |
| `session:destroy` | No | Persist session artifacts |

---

## 8. Context Providers

Inject content into the system prompt before every LLM call. Used by skills, memory, personas, etc.

```typescript
// In init():
ctx.registerContextProvider({
  name: "<name>",
  priority: 10,       // lower = injected earlier in context (default: 100)
  enabled: true,
  async getContext(messageInfo?) {
    const content = await buildContent();
    if (!content) return null;  // return null to inject nothing
    return {
      content,
      role: "system" as const,
      metadata: {
        source: "<name>",
        priority: 10,
      },
    };
  },
});

// In shutdown():
ctx.unregisterContextProvider("<name>");
```

> The skills plugin uses this to inject available skills as XML before every LLM call. The memory plugin uses it to inject recalled memories. Use this whenever your plugin needs to add persistent context to every conversation.

---

## 9. A2A Tools (Agent-to-Agent)

Register tools that AI agents can invoke. Always guard — `registerA2AServer` is optional in older WOPR versions.

```typescript
// In init():
if (ctx.registerA2AServer) {
  ctx.registerA2AServer({
    name: "<name>",
    version: "1.0",
    tools: [
      {
        name: "plugin.action",     // namespaced: "plugin.verb"
        description: "Does the thing",
        inputSchema: {             // JSON Schema — not Zod
          type: "object",
          properties: {
            input: { type: "string", description: "The input" },
            sessionId: { type: "string", description: "Session ID" },
          },
          required: ["input"],
        },
        async handler(args) {
          const { input, sessionId } = args as { input: string; sessionId?: string };
          try {
            const result = await doThing(input);
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text" as const, text: message }], isError: true };
          }
        },
      },
    ],
  });
}
```

**Handler return shape:** `{ content: [{ type: "text", text: string }], isError?: boolean }`

---

## 10. Extensions (Plugin-to-Plugin API)

Expose a typed API that other plugins can discover and call at runtime.

```typescript
// Provider plugin — in init():
ctx.registerExtension("<name>", {
  doSomething: async (arg: string): Promise<string> => { /* ... */ },
  getStatus: (): { connected: boolean } => ({ connected: true }),
});
// In shutdown():
ctx.unregisterExtension("<name>");

// Consumer plugin:
const ext = ctx.getExtension("<name>") as
  | { doSomething(s: string): Promise<string>; getStatus(): { connected: boolean } }
  | undefined;
if (ext) {
  const result = await ext.doSomething("hello");
}
```

**Extension vs REST router**: Use `registerExtension` for in-process APIs between plugins. If you need an HTTP endpoint, expose a Hono router as an extension:

```typescript
import { Hono } from "hono";

const router = new Hono();
router.get("/status", (c) => c.json({ ok: true }));

// In init():
ctx.registerExtension("<name>:router", router);
// Daemon mounts it at /plugins/<name>/...
```

---

## 11. Capability Providers

Declare capabilities in `manifest.provides.capabilities` AND register at runtime. The manifest is for discovery; the registration is for runtime routing.

### LLM Provider

```typescript
// In init():
ctx.registerLLMProvider(myLLMProvider);
// In shutdown():
ctx.unregisterLLMProvider("<provider-id>");
```

### Generic Capability Provider (TTS, STT, image-gen, wake-word, etc.)

All non-LLM capabilities use the generic `CapabilityRegistry` API:

```typescript
// In init():
ctx.registerCapabilityProvider("tts", myTTSProvider);
ctx.registerCapabilityProvider("stt", mySTTProvider);

// Check availability from any plugin:
const hasTTS = ctx.hasCapability("tts");           // boolean
const ttsProviders = ctx.getCapabilityProviders("tts");  // provider[]
const tts = ttsProviders[0];                       // primary provider

// In shutdown():
ctx.unregisterCapabilityProvider("tts", "<provider-id>");
```

This pattern extends to any new capability type without modifying `plugin-types`. The capability type string (`"tts"`, `"stt"`, `"image-gen"`, etc.) is the contract.

> **Note**: `ctx.registerSTTProvider`, `ctx.registerTTSProvider`, `ctx.getSTT()`, `ctx.getTTS()`, `ctx.hasVoice()` exist as legacy methods but are dead code — **never use them**. WOP-751 tracks their removal.

---

## 12. Channel Provider

If your plugin IS a communication channel (Discord, Slack, Telegram, etc.):

```typescript
import type { ChannelProvider, ChannelCommand } from "@wopr-network/plugin-types";

// Channel commands — slash/prefix commands available in this channel
const commands: ChannelCommand[] = [
  {
    name: "imagine",
    description: "Generate an image from a text prompt",
    async handler(cmdCtx) {
      const { message, session, reply } = cmdCtx;
      await reply("Generating...");
      // ...
    },
  },
];

const myChannelProvider: ChannelProvider = {
  type: "<name>",    // unique identifier — "discord", "slack", "telegram", etc.
  async send(channelId: string, content: string) { /* ... */ },
  async getInfo(channelId: string) {
    return { id: channelId, name: "...", type: "<name>" };
  },
};

// In init():
ctx.registerChannelProvider(myChannelProvider);
// In shutdown():
ctx.unregisterChannelProvider("<name>");
```

---

## 13. Dashboard UI (WebUI + UI Components)

### WebUI link (adds a nav entry to the dashboard sidebar)

```typescript
// In init():
ctx.registerWebUiExtension({
  id: "<name>",
  title: "My Plugin",
  url: `http://127.0.0.1:${port}`,    // plugin's own HTTP server
  description: "Manage my plugin",
  category: "plugins",
});
// In shutdown():
ctx.unregisterWebUiExtension("<name>");
```

### UI Component (renders a SolidJS component inline in the dashboard)

```typescript
// In init():
ctx.registerUiComponent({
  id: "<name>-panel",
  title: "My Plugin",
  moduleUrl: `http://127.0.0.1:${port}/ui.js`,  // compiled SolidJS ES module
  slot: "settings",   // "sidebar" | "settings" | "statusbar" | "chat-header" | "chat-footer"
  description: "My plugin settings panel",
});
// In shutdown():
ctx.unregisterUiComponent("<name>-panel");
```

The component module receives `PluginUiComponentProps` — use the provided `api` object for all daemon calls. Never import server-side code into the component module.

### WebMCP Tools (browser-callable tools in the web UI)

```typescript
// src/webmcp.ts
import type { WebMCPRegistryLike, WebMCPToolDeclaration } from "@wopr-network/plugin-types";

export const WEBMCP_MANIFEST: WebMCPToolDeclaration[] = [
  {
    name: "myPlugin.search",
    description: "Search plugin data",
    parameters: {
      query: { type: "string", description: "Search query", required: true },
    },
  },
];

export function registerMyPluginTools(registry: WebMCPRegistryLike, apiBase = "/api"): void {
  registry.register({
    ...WEBMCP_MANIFEST[0],
    handler: async (params, auth) => {
      const res = await fetch(`${apiBase}/plugins/<name>/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}) },
        body: JSON.stringify(params),
      });
      return res.json();
    },
  });
}

export function unregisterMyPluginTools(registry: WebMCPRegistryLike): void {
  for (const decl of WEBMCP_MANIFEST) registry.unregister(decl.name);
}

// Re-export from src/index.ts so web UI can import them
export { registerMyPluginTools, unregisterMyPluginTools, WEBMCP_MANIFEST } from "./webmcp.js";
```

---

## 14. Background Timers

```typescript
let timer: NodeJS.Timeout | null = null;

// In init():
timer = setInterval(async () => {
  try {
    await doPeriodicWork(ctx!);
  } catch (error: unknown) {
    ctx?.log.error(`Periodic work failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}, 60_000);

// In shutdown():
if (timer) { clearInterval(timer); timer = null; }
```

> **Always** clear intervals in `shutdown()`. Leaked timers prevent clean daemon restart.

---

## 15. Other Useful Context Methods

```typescript
// Sessions
const sessions = ctx.getSessions();             // string[] — all active sessions
const channels = ctx.getChannelsForSession(session);

// Inject without triggering a response (logging to session history only)
ctx.logMessage(session, "System: reconnected", { from: "my-plugin" });

// Cancel an in-flight injection
ctx.cancelInject(session);

// Agent persona and user profile
const identity = await ctx.getAgentIdentity();  // { name?, creature?, vibe?, emoji? }
const user = await ctx.getUserProfile();         // { name?, timezone?, pronouns?, ... }

// Plugin's own data directory (persistent across restarts)
const dir = ctx.getPluginDir();                  // e.g. ~/.wopr/plugins/<name>

// Read current config, save updated config
const config = ctx.getConfig<MyConfig>();
await ctx.saveConfig({ ...config, apiKey: "new-key" });

// Read main WOPR config (read-only)
const mainConfig = ctx.getMainConfig("discord"); // { token?, clientId?, ... }
```

---

## 16. Package.json

```json
{
  "name": "@wopr-network/wopr-plugin-<name>",
  "version": "1.0.0",
  "description": "One-line description",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "prepublishOnly": "npm run build",
    "lint": "biome check --config-path=. src/",
    "lint:fix": "biome check --config-path=. --fix src/",
    "format": "biome format --config-path=. --write src/",
    "check": "biome check --config-path=. src/ && tsc --noEmit",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@wopr-network/plugin-types": "^0.2.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.15",
    "@types/node": "^25.0.0",
    "typescript": "^5.3.0",
    "vitest": "^4.0.0"
  },
  "publishConfig": { "access": "public" },
  "files": ["dist"],
  "keywords": ["wopr", "plugin", "<name>"]
}
```

---

## 17. CI Workflows

### `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  lint-and-check:
    runs-on: [self-hosted, Linux, X64]
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint || echo "No lint script, skipping"
      - run: bun run typecheck || bunx --no-install tsc --noEmit

  build:
    runs-on: [self-hosted, Linux, X64]
    needs: lint-and-check
    strategy:
      matrix:
        node-version: [20.x, 22.x]
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }
      - uses: actions/setup-node@v4
        with: { node-version: "${{ matrix.node-version }}" }
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist-node-${{ matrix.node-version }}
          path: dist/
          if-no-files-found: error
          retention-days: 1

  validate-package:
    runs-on: [self-hosted, Linux, X64]
    needs: build
    strategy:
      matrix:
        node-version: [20.x, 22.x]
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }
      - uses: actions/setup-node@v4
        with: { node-version: "${{ matrix.node-version }}" }
      - uses: oven-sh/setup-bun@v2
      - run: bun install --production
      - uses: actions/download-artifact@v4
        with:
          name: dist-node-${{ matrix.node-version }}
          path: dist/
      - run: test -f dist/index.js && test -f dist/index.d.ts
      - run: node --input-type=module -e "import('./dist/index.js').then(() => console.log('ESM OK'))"
      - run: npm pack --dry-run

  test:
    runs-on: [self-hosted, Linux, X64]
    needs: lint-and-check
    steps:
      - uses: actions/checkout@v4
        with: { persist-credentials: false }
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run test || echo "No test script, skipping"
```

### `.github/workflows/publish.yml`

```yaml
name: Publish to npm
on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: [self-hosted, Linux, X64]
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build
      - run: bun test || true
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**All CI uses `runs-on: [self-hosted, Linux, X64]`. Never `ubuntu-latest` or GitHub-hosted runners.**

---

## 18. CLAUDE.md

Every plugin repo must have a `CLAUDE.md` covering:
- Repo name + purpose
- Build commands (`npm run build`, `npm run check`, `npm test`)
- Architecture (src/ file map)
- Key details and gotchas
- Plugin contract reminder: "Imports only from `@wopr-network/plugin-types`"
- Issue tracking: "All issues in GitHub Issues (org: wopr-network). Descriptions start with `**Repo:** wopr-network/wopr-plugin-<name>`"

---

## 19. Installation

```bash
wopr plugin install @wopr-network/wopr-plugin-<name>
# then restart:
wopr daemon restart
```

---

## Quick Reference

| What | How |
|------|-----|
| Get config | `ctx.getConfig<MyConfig>()` |
| Save config | `await ctx.saveConfig(newConfig)` |
| Register config UI | `ctx.registerConfigSchema("plugin-id", schema)` |
| Unregister config UI | `ctx.unregisterConfigSchema("plugin-id")` in shutdown |
| Log | `ctx.log.info("msg")` / `ctx.log.error("msg")` |
| Plugin data dir | `ctx.getPluginDir()` |
| Active sessions | `ctx.getSessions()` |
| Log to session (no AI) | `ctx.logMessage(session, msg)` |
| Cancel in-flight inject | `ctx.cancelInject(session)` |
| Agent identity | `await ctx.getAgentIdentity()` |
| User profile | `await ctx.getUserProfile()` |
| Storage (register) | `await ctx.storage.register(myPluginSchema)` |
| Storage (use) | `ctx.storage.getRepository<T>(namespace, table)` |
| Listen to event | `ctx.events.on("session:afterInject", handler)` → returns unsub |
| Emit custom event | `ctx.events.emitCustom("my:event", payload)` |
| Add hook (mutable) | `ctx.hooks.on("message:incoming", handler, { priority })` |
| Context provider | `ctx.registerContextProvider({ name, priority, getContext })` |
| Register A2A tools | `if (ctx.registerA2AServer) ctx.registerA2AServer({ name, version, tools[] })` |
| Expose plugin API | `ctx.registerExtension("name", api)` |
| Consume plugin API | `ctx.getExtension<T>("name")` |
| Register channel | `ctx.registerChannelProvider(provider)` |
| Register LLM | `ctx.registerLLMProvider(provider)` / `ctx.unregisterLLMProvider(id)` |
| Register capability (TTS/STT/etc.) | `ctx.registerCapabilityProvider(type, provider)` |
| Unregister capability | `ctx.unregisterCapabilityProvider(type, "<provider-id>")` |
| Check capability | `ctx.hasCapability(type)` → `boolean` |
| Get capability providers | `ctx.getCapabilityProviders(type)` → `provider[]` |
| WebUI link | `ctx.registerWebUiExtension({ id, title, url, category })` |
| UI component | `ctx.registerUiComponent({ id, title, moduleUrl, slot })` |
| Background timer | `setInterval(fn, ms)` in init, `clearInterval(timer)` in shutdown |
| Main WOPR config | `ctx.getMainConfig("discord")` (read-only) |
| GitHub issues | Descriptions must start with `**Repo:** wopr-network/wopr-plugin-<name>` |
