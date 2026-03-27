import { brandName } from "../brand-config";

export type { ToolDefinition } from "./tool-definitions";
export { getPlatformUIToolDefinitions } from "./tool-definitions";

/**
 * platform-ui plugin — Browser-side configurator UI tools.
 *
 * This plugin's tools run in the browser via the WebMCP API.
 * The init/shutdown hooks are no-ops because tool registration
 * happens client-side in the useWebMCP React hook.
 *
 * The exported getPlatformUIToolDefinitions() function provides serializable metadata
 * (name, description, inputSchema) that the platform can advertise
 * to the configurator AI without needing browser APIs.
 */
const plugin = {
  name: "platform-ui" as const,
  version: "1.0.0",
  description: `Browser-side configurator UI tools for the ${brandName()} platform dashboard`,
  commands: [] as never[],

  async init(_ctx: Record<string, unknown>): Promise<void> {
    // No-op: tool registration happens browser-side via useWebMCP hook
  },

  async shutdown(): Promise<void> {
    // No-op: browser handles cleanup
  },
};

export default plugin;
