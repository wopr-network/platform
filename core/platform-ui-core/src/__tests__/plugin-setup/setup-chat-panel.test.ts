import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getChatWebMCPTools } from "@/lib/webmcp/tools";

let dispatchSpy: ReturnType<typeof vi.spyOn>;

function getTool(name: string): ModelContextTool {
  const tools = getChatWebMCPTools();
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool '${name}' not found`);
  return tool;
}

function getDispatchedCustomEvent(): CustomEvent {
  const event = dispatchSpy.mock.calls[0][0];
  if (!(event instanceof CustomEvent)) throw new Error("Expected a CustomEvent");
  return event;
}

describe("setup tool handlers", () => {
  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
  });

  describe("setup.begin", () => {
    it("dispatches setup.begin event with pluginId and botId", async () => {
      const tool = getTool("setup.begin");

      const result = await tool.handler({ pluginId: "discord", botId: "bot-001" });

      expect(result).toEqual({ ok: true });
      expect(dispatchSpy).toHaveBeenCalledOnce();
      const event = getDispatchedCustomEvent();
      expect(event.type).toBe("platform-chat-tool-call");
      expect(event.detail).toEqual({
        tool: "setup.begin",
        args: { pluginId: "discord", botId: "bot-001" },
      });
    });
  });

  describe("setup.ask", () => {
    it("dispatches setup.ask event with question and fieldName", async () => {
      const tool = getTool("setup.ask");

      const result = await tool.handler({ question: "Enter your API key", fieldName: "apiKey" });

      expect(result).toEqual({ ok: true });
      expect(dispatchSpy).toHaveBeenCalledOnce();
      const event = getDispatchedCustomEvent();
      expect(event.type).toBe("platform-chat-tool-call");
      expect(event.detail).toEqual({
        tool: "setup.ask",
        args: { question: "Enter your API key", fieldName: "apiKey" },
      });
    });

    it("dispatches setup.ask event with question only (no fieldName)", async () => {
      const tool = getTool("setup.ask");

      const result = await tool.handler({ question: "Which region?" });

      expect(result).toEqual({ ok: true });
      expect(dispatchSpy).toHaveBeenCalledOnce();
      const event = getDispatchedCustomEvent();
      expect(event.type).toBe("platform-chat-tool-call");
      expect(event.detail).toEqual({
        tool: "setup.ask",
        args: { question: "Which region?", fieldName: undefined },
      });
    });
  });

  describe("setup.validateKey", () => {
    it("dispatches setup.validateKey event with fieldName and value", async () => {
      const tool = getTool("setup.validateKey");

      const result = await tool.handler({ fieldName: "apiKey", value: "sk-test-123" });

      expect(result).toEqual({ ok: true });
      expect(dispatchSpy).toHaveBeenCalledOnce();
      const event = getDispatchedCustomEvent();
      expect(event.type).toBe("platform-chat-tool-call");
      expect(event.detail).toEqual({
        tool: "setup.validateKey",
        args: { fieldName: "apiKey", value: "sk-test-123" },
      });
    });
  });

  describe("setup.saveConfig", () => {
    it("dispatches setup.saveConfig event with pluginId and config object", async () => {
      const tool = getTool("setup.saveConfig");
      const config = { apiKey: "sk-test-123", region: "us-east-1" };

      const result = await tool.handler({ pluginId: "discord", config });

      expect(result).toEqual({ ok: true });
      expect(dispatchSpy).toHaveBeenCalledOnce();
      const event = getDispatchedCustomEvent();
      expect(event.type).toBe("platform-chat-tool-call");
      expect(event.detail).toEqual({
        tool: "setup.saveConfig",
        args: { pluginId: "discord", config },
      });
    });
  });

  describe("setup.complete", () => {
    it("dispatches setup.complete event with pluginId", async () => {
      const tool = getTool("setup.complete");

      const result = await tool.handler({ pluginId: "discord" });

      expect(result).toEqual({ ok: true });
      expect(dispatchSpy).toHaveBeenCalledOnce();
      const event = getDispatchedCustomEvent();
      expect(event.type).toBe("platform-chat-tool-call");
      expect(event.detail).toEqual({ tool: "setup.complete", args: { pluginId: "discord" } });
    });
  });

  describe("setup.rollback", () => {
    it("dispatches setup.rollback event with pluginId and reason", async () => {
      const tool = getTool("setup.rollback");

      const result = await tool.handler({ pluginId: "discord", reason: "Invalid API key" });

      expect(result).toEqual({ ok: true });
      expect(dispatchSpy).toHaveBeenCalledOnce();
      const event = getDispatchedCustomEvent();
      expect(event.type).toBe("platform-chat-tool-call");
      expect(event.detail).toEqual({
        tool: "setup.rollback",
        args: { pluginId: "discord", reason: "Invalid API key" },
      });
    });
  });
});
