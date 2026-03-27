import {
  controlInstance,
  createInstance,
  getInstanceHealth,
  getInstanceLogs,
  listInstances,
} from "@/lib/api";
import { installPlugin } from "@/lib/bot-settings-data";
import { brandName, eventName, getBrandConfig, productName } from "@/lib/brand-config";
import { listMarketplacePlugins } from "@/lib/marketplace-data";

/** Actions that require UI confirmation before executing. */
const DESTRUCTIVE_ACTIONS = new Set(["destroy"]);

/**
 * Callback type for requesting UI confirmation on destructive actions.
 * The registration code passes this in from the React layer.
 */
export type ConfirmCallback = (message: string) => Promise<boolean>;

export function getWebMCPTools(confirm: ConfirmCallback): ModelContextTool[] {
  const t = getBrandConfig().toolPrefix;
  return [
    {
      name: `${t}_list_instances`,
      description: `List all ${productName()} instances with their status, uptime, template, provider, and installed plugins.`,
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        try {
          const instances = await listInstances();
          return { instances };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: `${t}_create_instance`,
      description: `Create a new ${productName()} instance from a preset.`,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the new instance" },
          template: {
            type: "string",
            description: "Preset name (e.g. 'Discord AI Bot', 'Custom')",
          },
          provider: {
            type: "string",
            description: "AI provider (e.g. 'anthropic', 'openai')",
          },
          channels: {
            type: "array",
            items: { type: "string" },
            description: "Channel plugins to enable (e.g. ['discord'])",
          },
          plugins: {
            type: "array",
            items: { type: "string" },
            description: "Additional plugin IDs to install",
          },
        },
        required: ["name", "template", "provider"],
      },
      handler: async (params) => {
        try {
          const instance = await createInstance({
            name: params.name as string,
            template: params.template as string,
            provider: params.provider as string,
            channels: (params.channels as string[]) ?? [],
            plugins: (params.plugins as string[]) ?? [],
          });
          return { instance };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: `${t}_control_instance`,
      description: `Control a ${productName()} instance: start, stop, or restart it. The 'destroy' action requires UI confirmation.`,
      inputSchema: {
        type: "object",
        properties: {
          instanceId: { type: "string", description: "The instance ID" },
          action: {
            type: "string",
            enum: ["start", "stop", "restart", "destroy"],
            description: "Action to perform",
          },
        },
        required: ["instanceId", "action"],
      },
      handler: async (params) => {
        try {
          const action = params.action as "start" | "stop" | "restart" | "destroy";
          const instanceId = params.instanceId as string;

          if (DESTRUCTIVE_ACTIONS.has(action)) {
            const confirmed = await confirm(
              `Are you sure you want to ${action} instance ${instanceId}? This action cannot be undone.`,
            );
            if (!confirmed) {
              return { error: "Action cancelled by user", cancelled: true };
            }
          }

          await controlInstance(instanceId, action);
          return { ok: true, instanceId, action };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: `${t}_install_plugin`,
      description: `Install a plugin on a ${productName()} instance.`,
      inputSchema: {
        type: "object",
        properties: {
          instanceId: {
            type: "string",
            description: "The instance ID to install the plugin on",
          },
          pluginName: { type: "string", description: "The plugin ID to install" },
        },
        required: ["instanceId", "pluginName"],
      },
      handler: async (params) => {
        try {
          const pluginName = params.pluginName as string;
          const instanceId = params.instanceId as string;

          // Pre-check: verify the plugin exists in the marketplace
          const allPlugins = await listMarketplacePlugins();
          const plugin = allPlugins.find((p) => p.id === pluginName);
          if (!plugin) {
            return { error: `Plugin '${pluginName}' not found in marketplace` };
          }

          // Install via the real fleet endpoint
          await installPlugin(instanceId, pluginName);

          return {
            ok: true,
            instanceId,
            pluginName,
            plugin: { id: plugin.id, name: plugin.name, version: plugin.version },
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: `${t}_browse_plugins`,
      description: `Browse available plugins in the ${brandName()} marketplace. Optionally filter by category.`,
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Filter by category: channel, provider, voice, memory, context, webhook, integration, ui, moderation, analytics",
          },
        },
      },
      handler: async (params) => {
        try {
          let plugins = await listMarketplacePlugins();
          if (params.category) {
            plugins = plugins.filter((p) => p.category === params.category);
          }
          return {
            plugins: plugins.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              version: p.version,
              category: p.category,
              capabilities: p.capabilities,
              author: p.author,
            })),
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: `${t}_get_instance_health`,
      description: `Get detailed health information for a ${productName()} instance, including uptime, session count, plugin health, and provider status.`,
      inputSchema: {
        type: "object",
        properties: {
          instanceId: { type: "string", description: "The instance ID" },
        },
        required: ["instanceId"],
      },
      handler: async (params) => {
        try {
          const health = await getInstanceHealth(params.instanceId as string);
          return { health };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
    {
      name: `${t}_view_logs`,
      description: `View recent logs for a ${productName()} instance. Optionally filter by log level.`,
      inputSchema: {
        type: "object",
        properties: {
          instanceId: { type: "string", description: "The instance ID" },
          level: {
            type: "string",
            enum: ["debug", "info", "warn", "error"],
            description: "Filter by log level",
          },
          limit: {
            type: "number",
            description: "Number of log entries to return (default 50)",
          },
        },
        required: ["instanceId"],
      },
      handler: async (params) => {
        try {
          const logs = await getInstanceLogs(params.instanceId as string, {
            level: params.level as "debug" | "info" | "warn" | "error" | undefined,
          });
          const limit = (params.limit as number) ?? 50;
          return { logs: logs.slice(0, limit) };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ];
}

/**
 * WebMCP tools for chat control. The bot can expand, collapse, fullscreen,
 * send messages, show typing, and notify via the chat panel.
 *
 * These dispatch CustomEvents that the ChatProvider listens to.
 */
export function getChatWebMCPTools(): ModelContextTool[] {
  function dispatch(tool: string, args: Record<string, unknown> = {}) {
    window.dispatchEvent(new CustomEvent(eventName("chat-tool-call"), { detail: { tool, args } }));
  }

  return [
    {
      name: "chat_expand",
      description: `Open the ${brandName()} chat panel.`,
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        dispatch("chat.expand");
        return { ok: true };
      },
    },
    {
      name: "chat_collapse",
      description: `Minimize the ${brandName()} chat to the ambient dot.`,
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        dispatch("chat.collapse");
        return { ok: true };
      },
    },
    {
      name: "chat_fullscreen",
      description: `Expand the ${brandName()} chat to full screen mode for setup sequences.`,
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        dispatch("chat.fullscreen");
        return { ok: true };
      },
    },
    {
      name: "chat_send_message",
      description: "Inject a message into the chat as if the user typed it.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "The message text to send" },
        },
        required: ["text"],
      },
      handler: async (params) => {
        dispatch("chat.sendMessage", { text: params.text });
        return { ok: true };
      },
    },
    {
      name: "chat_show_typing",
      description: "Show the typing indicator in the chat panel.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        dispatch("chat.showTyping");
        return { ok: true };
      },
    },
    {
      name: "chat_notify",
      description: "Show a notification from the bot, expanding the chat if collapsed.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Notification text" },
        },
        required: ["text"],
      },
      handler: async (params) => {
        dispatch("chat.notify", { text: params.text });
        return { ok: true };
      },
    },
    {
      name: "setup.begin",
      description:
        "Begin conversational setup for a plugin. Bot receives plugin ID and config schema.",
      inputSchema: {
        type: "object",
        properties: {
          pluginId: { type: "string", description: "The plugin to configure" },
          botId: { type: "string", description: "The bot instance to configure for" },
        },
        required: ["pluginId", "botId"],
      },
      handler: async (params) => {
        dispatch("setup.begin", { pluginId: params.pluginId, botId: params.botId });
        return { ok: true };
      },
    },
    {
      name: "setup.ask",
      description: "Bot asks the user a setup question (rendered as a chat message).",
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to display" },
          fieldName: { type: "string", description: "Config field being collected" },
        },
        required: ["question"],
      },
      handler: async (params) => {
        dispatch("setup.ask", { question: params.question, fieldName: params.fieldName });
        return { ok: true };
      },
    },
    {
      name: "setup.validateKey",
      description: "Validate an API key or credential entered by the user.",
      inputSchema: {
        type: "object",
        properties: {
          fieldName: { type: "string", description: "The config field name" },
          value: { type: "string", description: "The value to validate" },
        },
        required: ["fieldName", "value"],
      },
      handler: async (params) => {
        dispatch("setup.validateKey", { fieldName: params.fieldName, value: params.value });
        return { ok: true };
      },
    },
    {
      name: "setup.saveConfig",
      description: "Save a configuration value for the plugin.",
      inputSchema: {
        type: "object",
        properties: {
          pluginId: { type: "string", description: "The plugin ID" },
          config: { type: "object", description: "Key-value config to save" },
        },
        required: ["pluginId", "config"],
      },
      handler: async (params) => {
        dispatch("setup.saveConfig", { pluginId: params.pluginId, config: params.config });
        return { ok: true };
      },
    },
    {
      name: "setup.complete",
      description: "Mark plugin setup as complete. Closes the setup chat panel.",
      inputSchema: {
        type: "object",
        properties: {
          pluginId: { type: "string", description: "The plugin ID" },
        },
        required: ["pluginId"],
      },
      handler: async (params) => {
        dispatch("setup.complete", { pluginId: params.pluginId });
        return { ok: true };
      },
    },
    {
      name: "setup.rollback",
      description: "Roll back a failed setup attempt. Shows error in chat.",
      inputSchema: {
        type: "object",
        properties: {
          pluginId: { type: "string", description: "The plugin ID" },
          reason: { type: "string", description: "Why the setup failed" },
        },
        required: ["pluginId", "reason"],
      },
      handler: async (params) => {
        dispatch("setup.rollback", { pluginId: params.pluginId, reason: params.reason });
        return { ok: true };
      },
    },
  ];
}
