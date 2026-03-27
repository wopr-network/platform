import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMarketplaceOnboardingTools } from "../lib/webmcp/marketplace-onboarding-tools";

const mockPush = vi.fn();
const deps = { router: { push: mockPush } };

function getTool(name: string): ModelContextTool {
  const tools = getMarketplaceOnboardingTools(deps);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool '${name}' not found`);
  return tool;
}

describe("getMarketplaceOnboardingTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.pathname
    Object.defineProperty(window, "location", {
      value: { pathname: "/marketplace" },
      writable: true,
    });
  });

  afterEach(() => {
    // Clean up any event listeners or DOM modifications
    document.body.innerHTML = "";
  });

  it("returns 9 tools", () => {
    const tools = getMarketplaceOnboardingTools(deps);
    expect(tools).toHaveLength(9);
  });

  it("each tool has name, description, inputSchema, handler", () => {
    const tools = getMarketplaceOnboardingTools(deps);
    for (const tool of tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool).toHaveProperty("handler");
    }
  });

  describe("marketplace.showSuperpowers", () => {
    it("dispatches platform-marketplace filter event when on marketplace page", async () => {
      const spy = vi.fn();
      window.addEventListener("platform-marketplace", spy);
      const tool = getTool("marketplace.showSuperpowers");

      const result = await tool.handler({ query: "voice" });

      expect(spy).toHaveBeenCalledOnce();
      const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ type: "filter", query: "voice" });
      expect(result).toEqual({ ok: true, navigated: false });
      window.removeEventListener("platform-marketplace", spy);
    });

    it("navigates to /marketplace when on a different page", async () => {
      Object.defineProperty(window, "location", {
        value: { pathname: "/dashboard" },
        writable: true,
      });
      const tool = getTool("marketplace.showSuperpowers");

      const result = await tool.handler({ query: "voice" });

      expect(mockPush).toHaveBeenCalledWith("/marketplace?q=voice");
      expect(result).toEqual({ ok: true, navigated: true });
    });
  });

  describe("marketplace.highlightCard", () => {
    it("adds pulse class and scrolls into view", async () => {
      const el = document.createElement("div");
      el.setAttribute("data-plugin-card-id", "discord");
      el.scrollIntoView = vi.fn();
      document.body.appendChild(el);

      const tool = getTool("marketplace.highlightCard");
      const result = await tool.handler({ pluginId: "discord" });

      expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
      expect(el.classList.contains("webmcp-pulse")).toBe(true);
      expect(result).toEqual({ ok: true });
    });

    it("returns error when card not found", async () => {
      const tool = getTool("marketplace.highlightCard");
      const result = (await tool.handler({ pluginId: "nonexistent" })) as { error: string };

      expect(result.error).toContain("nonexistent");
    });
  });

  describe("marketplace.openDetail", () => {
    it("navigates to plugin detail page", async () => {
      const tool = getTool("marketplace.openDetail");
      const result = await tool.handler({ pluginId: "discord" });

      expect(mockPush).toHaveBeenCalledWith("/marketplace/discord");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("marketplace.clearFilter", () => {
    it("dispatches clearFilter event", async () => {
      const spy = vi.fn();
      window.addEventListener("platform-marketplace", spy);
      const tool = getTool("marketplace.clearFilter");

      const result = await tool.handler({});

      expect(spy).toHaveBeenCalledOnce();
      const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ type: "clearFilter" });
      expect(result).toEqual({ ok: true });
      window.removeEventListener("platform-marketplace", spy);
    });
  });

  describe("onboarding.beginSetup", () => {
    it("dispatches chat.expand event for plugin setup", async () => {
      const spy = vi.fn();
      window.addEventListener("platform-chat-tool-call", spy);
      const tool = getTool("onboarding.beginSetup");

      const result = await tool.handler({ pluginId: "discord" });

      expect(spy).toHaveBeenCalledOnce();
      const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ tool: "chat.expand", args: {} });
      expect(result).toEqual({ ok: true, pluginId: "discord" });
      window.removeEventListener("platform-chat-tool-call", spy);
    });
  });

  describe("onboarding.markComplete", () => {
    it("dispatches platform-onboarding complete event", async () => {
      const spy = vi.fn();
      window.addEventListener("platform-onboarding", spy);
      const tool = getTool("onboarding.markComplete");

      const result = await tool.handler({ step: "plugins" });

      expect(spy).toHaveBeenCalledOnce();
      const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
      expect(detail).toEqual({ type: "markComplete", step: "plugins" });
      expect(result).toEqual({ ok: true });
      window.removeEventListener("platform-onboarding", spy);
    });
  });

  describe("onboarding.showPricing", () => {
    it("navigates to /pricing", async () => {
      const tool = getTool("onboarding.showPricing");
      const result = await tool.handler({});

      expect(mockPush).toHaveBeenCalledWith("/pricing");
      expect(result).toEqual({ ok: true });
    });
  });

  describe("onboarding.click", () => {
    it("clicks element with matching data-onboarding-id", async () => {
      const el = document.createElement("button");
      el.setAttribute("data-onboarding-id", "next-step");
      el.click = vi.fn();
      document.body.appendChild(el);

      const tool = getTool("onboarding.click");
      const result = await tool.handler({ elementId: "next-step" });

      expect(el.click).toHaveBeenCalledOnce();
      expect(result).toEqual({ ok: true });
    });

    it("returns error when element not found", async () => {
      const tool = getTool("onboarding.click");
      const result = (await tool.handler({ elementId: "nonexistent" })) as { error: string };

      expect(result.error).toContain("nonexistent");
    });
  });
});
