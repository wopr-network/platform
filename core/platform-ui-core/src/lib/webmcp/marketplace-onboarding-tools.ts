import { eventName } from "@/lib/brand-config";

export interface MarketplaceOnboardingToolDeps {
  router: { push: (url: string) => void };
}

const PULSE_DURATION_MS = 2000;

function isOnMarketplace(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/marketplace");
}

export function getMarketplaceOnboardingTools(
  deps: MarketplaceOnboardingToolDeps,
): ModelContextTool[] {
  const { router } = deps;

  return [
    // ── Marketplace tools ───────────────────────────────────────────
    {
      name: "marketplace.showSuperpowers",
      description:
        "Filter the marketplace grid by a search query. Navigates to the marketplace page first if needed.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search/filter query for superpowers" },
        },
        required: ["query"],
      },
      handler: async (params) => {
        const query = params.query as string;
        if (!isOnMarketplace()) {
          router.push(`/marketplace?q=${encodeURIComponent(query)}`);
          return { ok: true, navigated: true };
        }
        window.dispatchEvent(
          new CustomEvent(eventName("marketplace"), { detail: { type: "filter", query } }),
        );
        return { ok: true, navigated: false };
      },
    },
    {
      name: "marketplace.highlightCard",
      description:
        "Pulse/glow a specific plugin card and scroll it into view. Uses data-plugin-card-id attribute.",
      inputSchema: {
        type: "object",
        properties: {
          pluginId: { type: "string", description: "The plugin ID to highlight" },
        },
        required: ["pluginId"],
      },
      handler: async (params) => {
        const pluginId = params.pluginId as string;
        const el = document.querySelector(`[data-plugin-card-id="${CSS.escape(pluginId)}"]`);
        if (!el) {
          return { error: `Plugin card '${pluginId}' not found on the current page` };
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("webmcp-pulse");
        setTimeout(() => el.classList.remove("webmcp-pulse"), PULSE_DURATION_MS);
        return { ok: true };
      },
    },
    {
      name: "marketplace.openDetail",
      description: "Navigate to a specific plugin's detail page in the marketplace.",
      inputSchema: {
        type: "object",
        properties: {
          pluginId: { type: "string", description: "The plugin ID to view" },
        },
        required: ["pluginId"],
      },
      handler: async (params) => {
        router.push(`/marketplace/${params.pluginId as string}`);
        return { ok: true };
      },
    },
    {
      name: "marketplace.clearFilter",
      description: "Reset marketplace search and category filters.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        window.dispatchEvent(
          new CustomEvent(eventName("marketplace"), { detail: { type: "clearFilter" } }),
        );
        return { ok: true };
      },
    },

    // ── Onboarding tools ────────────────────────────────────────────
    {
      name: "onboarding.beginSetup",
      description: "Expand the chat panel to begin conversational setup for a specific plugin.",
      inputSchema: {
        type: "object",
        properties: {
          pluginId: { type: "string", description: "Plugin ID to begin setup for" },
        },
        required: ["pluginId"],
      },
      handler: async (params) => {
        window.dispatchEvent(
          new CustomEvent(eventName("chat-tool-call"), {
            detail: { tool: "chat.expand", args: {} },
          }),
        );
        return { ok: true, pluginId: params.pluginId };
      },
    },
    {
      name: "onboarding.markComplete",
      description: "Mark an onboarding step as complete, advancing the progress tracker.",
      inputSchema: {
        type: "object",
        properties: {
          step: { type: "string", description: "The step ID to mark complete" },
        },
        required: ["step"],
      },
      handler: async (params) => {
        window.dispatchEvent(
          new CustomEvent(eventName("onboarding"), {
            detail: { type: "markComplete", step: params.step as string },
          }),
        );
        return { ok: true };
      },
    },
    {
      name: "onboarding.showPricing",
      description: "Navigate to the pricing page or open the pricing modal.",
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        router.push("/pricing");
        return { ok: true };
      },
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
      handler: async (params) => {
        const provider = params.provider as string;
        const valid = ["anthropic", "openai", "google", "hosted"];
        if (!valid.includes(provider)) {
          return { error: `Invalid provider: ${provider}. Must be one of: ${valid.join(", ")}` };
        }
        window.dispatchEvent(
          new CustomEvent(eventName("onboarding"), {
            detail: { type: "setProvider", provider },
          }),
        );
        return { ok: true };
      },
    },
    {
      name: "onboarding.click",
      description: "Click any element on the page identified by its data-onboarding-id attribute.",
      inputSchema: {
        type: "object",
        properties: {
          elementId: {
            type: "string",
            description: "Value of the data-onboarding-id attribute on the target element",
          },
        },
        required: ["elementId"],
      },
      handler: async (params) => {
        const elementId = params.elementId as string;
        const el = document.querySelector(
          `[data-onboarding-id="${CSS.escape(elementId)}"]`,
        ) as HTMLElement | null;
        if (!el) {
          return { error: `Element with data-onboarding-id='${elementId}' not found` };
        }
        el.click();
        return { ok: true };
      },
    },
  ];
}
