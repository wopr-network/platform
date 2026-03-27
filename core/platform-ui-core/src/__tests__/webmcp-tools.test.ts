import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWebMCPTools } from "../lib/webmcp/tools";

const mockListInstances = vi.fn();
const mockCreateInstance = vi.fn();
const mockControlInstance = vi.fn();
const mockGetInstanceHealth = vi.fn();
const mockGetInstanceLogs = vi.fn();
const mockListMarketplacePlugins = vi.fn();
const mockInstallPlugin = vi.fn();

vi.mock("@/lib/api", () => ({
  listInstances: (...args: unknown[]) => mockListInstances(...args),
  createInstance: (...args: unknown[]) => mockCreateInstance(...args),
  controlInstance: (...args: unknown[]) => mockControlInstance(...args),
  getInstanceHealth: (...args: unknown[]) => mockGetInstanceHealth(...args),
  getInstanceLogs: (...args: unknown[]) => mockGetInstanceLogs(...args),
}));

vi.mock("@/lib/marketplace-data", () => ({
  listMarketplacePlugins: (...args: unknown[]) => mockListMarketplacePlugins(...args),
}));

vi.mock("@/lib/bot-settings-data", () => ({
  installPlugin: (...args: unknown[]) => mockInstallPlugin(...args),
}));

const mockConfirm = vi.fn<(message: string) => Promise<boolean>>();

function getTool(name: string): ModelContextTool {
  const tools = getWebMCPTools(mockConfirm);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool '${name}' not found`);
  return tool;
}

const MOCK_INSTANCES = [
  {
    id: "inst-001",
    name: "Test Bot",
    template: "General Assistant",
    status: "running",
    provider: "anthropic",
    channels: ["discord"],
    plugins: [],
    uptime: 3600,
    createdAt: "2026-01-01T00:00:00Z",
  },
];

const MOCK_PLUGINS = [
  {
    id: "discord",
    name: "Discord",
    description: "Discord integration",
    version: "3.2.0",
    author: "Platform Team",
    icon: "MessageCircle",
    color: "#5865F2",
    category: "channel",
    tags: ["channel"],
    capabilities: ["channel"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [],
    installCount: 12400,
    changelog: [],
  },
  {
    id: "semantic-memory",
    name: "Semantic Memory",
    description: "Long-term memory",
    version: "1.4.0",
    author: "Platform Team",
    icon: "Database",
    color: "#8B5CF6",
    category: "memory",
    tags: ["memory"],
    capabilities: ["memory"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [],
    installCount: 9800,
    changelog: [],
  },
];

describe("getWebMCPTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 7 tools", () => {
    const tools = getWebMCPTools(mockConfirm);
    expect(tools).toHaveLength(7);
  });

  it("each tool has name, description, inputSchema, handler", () => {
    const tools = getWebMCPTools(mockConfirm);
    for (const tool of tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("handler");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.handler).toBe("function");
    }
  });

  describe("platform_list_instances handler", () => {
    it("calls listInstances() and returns the result", async () => {
      mockListInstances.mockResolvedValue(MOCK_INSTANCES);
      const tool = getTool("platform_list_instances");

      const result = await tool.handler({});

      expect(mockListInstances).toHaveBeenCalledOnce();
      expect(result).toEqual({ instances: MOCK_INSTANCES });
    });
  });

  describe("platform_control_instance handler", () => {
    it("calls controlInstance for non-destructive actions without confirmation", async () => {
      mockControlInstance.mockResolvedValue(undefined);
      const tool = getTool("platform_control_instance");

      const result = await tool.handler({ instanceId: "inst-001", action: "restart" });

      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockControlInstance).toHaveBeenCalledWith("inst-001", "restart");
      expect(result).toEqual({ ok: true, instanceId: "inst-001", action: "restart" });
    });

    it("calls confirm callback for destroy action", async () => {
      mockConfirm.mockResolvedValue(true);
      mockControlInstance.mockResolvedValue(undefined);
      const tool = getTool("platform_control_instance");

      await tool.handler({ instanceId: "inst-001", action: "destroy" });

      expect(mockConfirm).toHaveBeenCalledOnce();
      expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining("destroy"));
    });

    it("returns cancelled result when user declines confirmation", async () => {
      mockConfirm.mockResolvedValue(false);
      const tool = getTool("platform_control_instance");

      const result = await tool.handler({ instanceId: "inst-001", action: "destroy" });

      expect(mockControlInstance).not.toHaveBeenCalled();
      expect(result).toEqual({ error: "Action cancelled by user", cancelled: true });
    });

    it("proceeds with destroy when user confirms", async () => {
      mockConfirm.mockResolvedValue(true);
      mockControlInstance.mockResolvedValue(undefined);
      const tool = getTool("platform_control_instance");

      const result = await tool.handler({ instanceId: "inst-001", action: "destroy" });

      expect(mockControlInstance).toHaveBeenCalledWith("inst-001", "destroy");
      expect(result).toEqual({ ok: true, instanceId: "inst-001", action: "destroy" });
    });
  });

  describe("platform_browse_plugins handler", () => {
    it("returns all plugins when no category filter", async () => {
      mockListMarketplacePlugins.mockResolvedValue(MOCK_PLUGINS);
      const tool = getTool("platform_browse_plugins");

      const result = (await tool.handler({})) as { plugins: unknown[] };

      expect(result.plugins).toHaveLength(2);
    });

    it("filters plugins by category", async () => {
      mockListMarketplacePlugins.mockResolvedValue(MOCK_PLUGINS);
      const tool = getTool("platform_browse_plugins");

      const result = (await tool.handler({ category: "channel" })) as {
        plugins: { id: string }[];
      };

      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].id).toBe("discord");
    });
  });

  describe("platform_create_instance handler", () => {
    it("calls createInstance with correct params", async () => {
      mockCreateInstance.mockResolvedValue(MOCK_INSTANCES[0]);
      const tool = getTool("platform_create_instance");

      const result = await tool.handler({
        name: "My Bot",
        template: "General Assistant",
        provider: "anthropic",
        channels: ["discord"],
        plugins: ["semantic-memory"],
      });

      expect(mockCreateInstance).toHaveBeenCalledWith({
        name: "My Bot",
        template: "General Assistant",
        provider: "anthropic",
        channels: ["discord"],
        plugins: ["semantic-memory"],
      });
      expect(result).toEqual({ instance: MOCK_INSTANCES[0] });
    });

    it("defaults channels and plugins to empty arrays", async () => {
      mockCreateInstance.mockResolvedValue(MOCK_INSTANCES[0]);
      const tool = getTool("platform_create_instance");

      await tool.handler({
        name: "My Bot",
        template: "General Assistant",
        provider: "anthropic",
      });

      expect(mockCreateInstance).toHaveBeenCalledWith({
        name: "My Bot",
        template: "General Assistant",
        provider: "anthropic",
        channels: [],
        plugins: [],
      });
    });
  });

  describe("platform_install_plugin handler", () => {
    it("calls installPlugin and returns success for valid plugin", async () => {
      mockListMarketplacePlugins.mockResolvedValue(MOCK_PLUGINS);
      mockInstallPlugin.mockResolvedValue(undefined);
      const tool = getTool("platform_install_plugin");

      const result = (await tool.handler({
        instanceId: "inst-001",
        pluginName: "discord",
      })) as { ok: boolean; instanceId: string; pluginName: string };

      expect(mockInstallPlugin).toHaveBeenCalledWith("inst-001", "discord");
      expect(result.ok).toBe(true);
      expect(result.instanceId).toBe("inst-001");
      expect(result.pluginName).toBe("discord");
    });

    it("returns error for unknown plugin name without calling install", async () => {
      mockListMarketplacePlugins.mockResolvedValue(MOCK_PLUGINS);
      const tool = getTool("platform_install_plugin");

      const result = (await tool.handler({
        instanceId: "inst-001",
        pluginName: "nonexistent-plugin",
      })) as { error: string };

      expect(result.error).toContain("nonexistent-plugin");
      expect(mockInstallPlugin).not.toHaveBeenCalled();
    });

    it("returns error when installPlugin rejects", async () => {
      mockListMarketplacePlugins.mockResolvedValue(MOCK_PLUGINS);
      mockInstallPlugin.mockRejectedValue(new Error("Server error"));
      const tool = getTool("platform_install_plugin");

      const result = (await tool.handler({
        instanceId: "inst-001",
        pluginName: "discord",
      })) as { error: string };

      expect(result.error).toBe("Server error");
    });
  });

  describe("platform_get_instance_health handler", () => {
    it("calls getInstanceHealth and returns { health }", async () => {
      const mockHealth = {
        instanceId: "inst-001",
        uptime: 3600,
        sessionCount: 42,
        plugins: [{ id: "discord", status: "ok" }],
        provider: { name: "anthropic", status: "ok" },
      };
      mockGetInstanceHealth.mockResolvedValue(mockHealth);
      const tool = getTool("platform_get_instance_health");

      const result = await tool.handler({ instanceId: "inst-001" });

      expect(mockGetInstanceHealth).toHaveBeenCalledWith("inst-001");
      expect(result).toEqual({ health: mockHealth });
    });

    it("returns { error } when getInstanceHealth throws", async () => {
      mockGetInstanceHealth.mockRejectedValue(new Error("Health check failed"));
      const tool = getTool("platform_get_instance_health");

      const result = (await tool.handler({ instanceId: "inst-001" })) as { error: string };

      expect(result.error).toBe("Health check failed");
    });
  });

  describe("platform_view_logs handler", () => {
    const MOCK_LOGS = Array.from({ length: 100 }, (_, i) => ({
      id: `log-${i}`,
      timestamp: "2026-01-01T00:00:00Z",
      level: i % 2 === 0 ? "info" : "error",
      source: "bot",
      message: `Log entry ${i}`,
    }));

    it("calls getInstanceLogs with level filter", async () => {
      mockGetInstanceLogs.mockResolvedValue(MOCK_LOGS.slice(0, 10));
      const tool = getTool("platform_view_logs");

      await tool.handler({ instanceId: "inst-001", level: "error" });

      expect(mockGetInstanceLogs).toHaveBeenCalledWith("inst-001", { level: "error" });
    });

    it("limits results to specified limit", async () => {
      mockGetInstanceLogs.mockResolvedValue(MOCK_LOGS);
      const tool = getTool("platform_view_logs");

      const result = (await tool.handler({
        instanceId: "inst-001",
        limit: 10,
      })) as { logs: unknown[] };

      expect(result.logs).toHaveLength(10);
    });

    it("defaults limit to 50", async () => {
      mockGetInstanceLogs.mockResolvedValue(MOCK_LOGS);
      const tool = getTool("platform_view_logs");

      const result = (await tool.handler({ instanceId: "inst-001" })) as { logs: unknown[] };

      expect(result.logs).toHaveLength(50);
    });
  });
});
