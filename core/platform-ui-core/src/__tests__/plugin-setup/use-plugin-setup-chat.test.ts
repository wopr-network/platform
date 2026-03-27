import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePluginSetupChat } from "@/hooks/use-plugin-setup-chat";

vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not mocked")));

describe("usePluginSetupChat", () => {
  it("starts closed with no plugin", () => {
    const { result } = renderHook(() => usePluginSetupChat());
    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.pluginId).toBeNull();
  });

  it("opens setup for a plugin", () => {
    const { result } = renderHook(() => usePluginSetupChat());
    act(() => {
      result.current.openSetup("discord", "Discord", "bot-1");
    });
    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.pluginId).toBe("discord");
    expect(result.current.state.pluginName).toBe("Discord");
  });

  it("closes setup and resets state", () => {
    const { result } = renderHook(() => usePluginSetupChat());
    act(() => {
      result.current.openSetup("discord", "Discord", "bot-1");
    });
    act(() => {
      result.current.closeSetup();
    });
    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.pluginId).toBeNull();
    expect(result.current.state.messages).toEqual([]);
  });

  it("adds user message via sendMessage", () => {
    const { result } = renderHook(() => usePluginSetupChat());
    act(() => {
      result.current.openSetup("discord", "Discord", "bot-1");
    });
    act(() => {
      result.current.sendMessage("my-api-key-123");
    });
    expect(result.current.state.messages).toHaveLength(1);
    expect(result.current.state.messages[0].role).toBe("user");
    expect(result.current.state.messages[0].content).toBe("my-api-key-123");
  });
});
