import { brandName, getBrandConfig, productName } from "../brand-config";

/** A tool definition without a handler — serializable metadata only. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** All WebMCP tool definitions for the platform-ui configurator. */
export function getPlatformUIToolDefinitions(): ToolDefinition[] {
  const t = getBrandConfig().toolPrefix;
  return [
    // Fleet management tools
    {
      name: `${t}_list_instances`,
      description: `List all ${productName()} instances with their status, uptime, template, provider, and installed plugins.`,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: `${t}_create_instance`,
      description: `Create a new ${productName()} instance from a preset.`,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name for the new instance" },
          template: { type: "string", description: "Preset name" },
          provider: { type: "string", description: "AI provider" },
          channels: {
            type: "array",
            items: { type: "string" },
            description: "Channel plugins to enable",
          },
          plugins: {
            type: "array",
            items: { type: "string" },
            description: "Additional plugin IDs to install",
          },
        },
        required: ["name", "template", "provider"],
      },
    },
    {
      name: `${t}_control_instance`,
      description: `Control a ${productName()} instance: start, stop, or restart it.`,
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
    },
    {
      name: `${t}_install_plugin`,
      description: `Install a plugin on a ${productName()} instance.`,
      inputSchema: {
        type: "object",
        properties: {
          instanceId: { type: "string", description: "The instance ID" },
          pluginName: { type: "string", description: "The plugin ID to install" },
        },
        required: ["instanceId", "pluginName"],
      },
    },
    {
      name: `${t}_browse_plugins`,
      description: `Browse available plugins in the ${brandName()} marketplace.`,
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category" },
        },
      },
    },
    {
      name: `${t}_get_instance_health`,
      description: `Get detailed health information for a ${productName()} instance.`,
      inputSchema: {
        type: "object",
        properties: { instanceId: { type: "string", description: "The instance ID" } },
        required: ["instanceId"],
      },
    },
    {
      name: `${t}_view_logs`,
      description: `View recent logs for a ${productName()} instance.`,
      inputSchema: {
        type: "object",
        properties: {
          instanceId: { type: "string", description: "The instance ID" },
          level: {
            type: "string",
            enum: ["debug", "info", "warn", "error"],
            description: "Filter by log level",
          },
          limit: { type: "number", description: "Number of log entries to return" },
        },
        required: ["instanceId"],
      },
    },
    // Chat tools
    {
      name: "chat_expand",
      description: `Open the ${brandName()} chat panel.`,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "chat_collapse",
      description: `Minimize the ${brandName()} chat to the ambient dot.`,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "chat_fullscreen",
      description: `Expand the ${brandName()} chat to full screen mode.`,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "chat_send_message",
      description: "Inject a message into the chat.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "The message text" } },
        required: ["text"],
      },
    },
    {
      name: "chat_show_typing",
      description: "Show the typing indicator in the chat panel.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "chat_notify",
      description: "Show a notification from the bot.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "Notification text" } },
        required: ["text"],
      },
    },
    // Marketplace tools
    {
      name: "marketplace.showSuperpowers",
      description: "Filter the marketplace grid by a search query.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Search/filter query" } },
        required: ["query"],
      },
    },
    {
      name: "marketplace.highlightCard",
      description: "Pulse/glow a specific plugin card and scroll it into view.",
      inputSchema: {
        type: "object",
        properties: { pluginId: { type: "string", description: "The plugin ID to highlight" } },
        required: ["pluginId"],
      },
    },
    {
      name: "marketplace.openDetail",
      description: "Navigate to a specific plugin's detail page.",
      inputSchema: {
        type: "object",
        properties: { pluginId: { type: "string", description: "The plugin ID to view" } },
        required: ["pluginId"],
      },
    },
    {
      name: "marketplace.clearFilter",
      description: "Reset marketplace search and category filters.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "onboarding.beginSetup",
      description: "Open fullscreen onboarding chat for a specific plugin.",
      inputSchema: {
        type: "object",
        properties: { pluginId: { type: "string", description: "Plugin ID to begin setup for" } },
        required: ["pluginId"],
      },
    },
    {
      name: "onboarding.markComplete",
      description: "Mark an onboarding step as complete.",
      inputSchema: {
        type: "object",
        properties: { step: { type: "string", description: "The step ID to mark complete" } },
        required: ["step"],
      },
    },
    {
      name: "onboarding.showPricing",
      description: "Navigate to the pricing page.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "onboarding.setProvider",
      description:
        "Save the user's AI provider choice. Use 'hosted' for hosted AI, or 'anthropic'/'openai'/'google' for BYOK.",
      inputSchema: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            enum: ["anthropic", "openai", "google", "hosted"],
            description: "The provider to set",
          },
        },
        required: ["provider"],
      },
    },
    {
      name: "onboarding.click",
      description: "Click any element on the page by data-onboarding-id.",
      inputSchema: {
        type: "object",
        properties: {
          elementId: {
            type: "string",
            description: "Value of data-onboarding-id attribute",
          },
        },
        required: ["elementId"],
      },
    },
    // Plugin setup tools
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
    },
  ];
}
