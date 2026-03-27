import { isWebMCPAvailable } from "./feature-detect";
import {
  getMarketplaceOnboardingTools,
  type MarketplaceOnboardingToolDeps,
} from "./marketplace-onboarding-tools";
import { type ConfirmCallback, getChatWebMCPTools, getWebMCPTools } from "./tools";

/**
 * Register all WebMCP tools with the browser.
 *
 * Prerequisites:
 * - WebMCP API must be available (Chrome 146+ DevTrial)
 * - User must be authenticated (session exists)
 *
 * @param isAuthenticated - Whether the user has a valid session
 * @param confirm - Callback for destructive action confirmation (e.g. window.confirm or a modal)
 * @param marketplaceDeps - Dependencies for marketplace/onboarding tools
 * @returns true if tools were registered, false if skipped
 */
export function registerWebMCPTools(
  isAuthenticated: boolean,
  confirm: ConfirmCallback,
  marketplaceDeps: MarketplaceOnboardingToolDeps,
): boolean {
  if (!isWebMCPAvailable()) {
    return false;
  }

  if (!isAuthenticated) {
    return false;
  }

  const tools = [
    ...getWebMCPTools(confirm),
    ...getMarketplaceOnboardingTools(marketplaceDeps),
    ...getChatWebMCPTools(),
  ];

  for (const tool of tools) {
    navigator.modelContext?.registerTool(tool);
  }

  return true;
}
