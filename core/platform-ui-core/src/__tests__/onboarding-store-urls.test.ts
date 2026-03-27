import { describe, expect, it } from "vitest";
import { PROVIDER_DOC_URLS } from "../config/provider-docs";

describe("AI_PROVIDERS keyHelpUrl consolidation", () => {
  it("all keyHelpUrl values match PROVIDER_DOC_URLS entries", async () => {
    const { AI_PROVIDERS } = await import("../lib/onboarding-store");

    const urlToProviderDocKey: Record<string, string> = {
      [PROVIDER_DOC_URLS.anthropic]: "anthropic",
      [PROVIDER_DOC_URLS.openai]: "openai",
      [PROVIDER_DOC_URLS.google]: "google",
      [PROVIDER_DOC_URLS.xai]: "xai",
      [PROVIDER_DOC_URLS.local]: "local",
    };

    for (const provider of AI_PROVIDERS) {
      expect(
        provider.keyHelpUrl in urlToProviderDocKey ||
          Object.values(PROVIDER_DOC_URLS).includes(provider.keyHelpUrl as never),
        `${provider.id} keyHelpUrl "${provider.keyHelpUrl}" should come from PROVIDER_DOC_URLS`,
      ).toBe(true);
    }
  });
});
