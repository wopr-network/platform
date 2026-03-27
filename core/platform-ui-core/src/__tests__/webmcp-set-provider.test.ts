import { describe, expect, it, vi } from "vitest";
import { getMarketplaceOnboardingTools } from "@/lib/webmcp/marketplace-onboarding-tools";

function findTool(name: string) {
  const deps = { router: { push: vi.fn() } };
  const tools = getMarketplaceOnboardingTools(deps);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool '${name}' not found`);
  return tool;
}

describe("onboarding.setProvider WebMCP tool", () => {
  it("dispatches platform-onboarding event with provider choice", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const tool = findTool("onboarding.setProvider");

    const result = await tool.handler({ provider: "anthropic" });
    expect(result).toEqual({ ok: true });

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "platform-onboarding",
        detail: { type: "setProvider", provider: "anthropic" },
      }),
    );
  });

  it("rejects invalid provider values", async () => {
    const tool = findTool("onboarding.setProvider");

    const result = await tool.handler({ provider: "invalid-provider" });
    expect(result).toEqual({ error: expect.stringContaining("Invalid provider") });
  });

  it("accepts hosted as a valid provider", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const tool = findTool("onboarding.setProvider");

    const result = await tool.handler({ provider: "hosted" });
    expect(result).toEqual({ ok: true });
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { type: "setProvider", provider: "hosted" },
      }),
    );
  });
});
