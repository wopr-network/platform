import { describe, expect, it } from "vitest";
import { PROVIDER_DOC_URLS } from "../config/provider-docs";

describe("PROVIDER_DOC_URLS", () => {
  it("contains all expected provider keys", () => {
    const expectedKeys = [
      "openai",
      "openrouter",
      "anthropic",
      "replicate",
      "elevenlabs",
      "elevenlabsHome",
      "deepgram",
      "discord",
      "slack",
      "telegram",
      "whatsapp",
      "msTeams",
      "moonshot",
      "github",
      "google",
      "xai",
      "local",
    ];
    for (const key of expectedKeys) {
      expect(PROVIDER_DOC_URLS).toHaveProperty(key);
    }
  });

  it("all values are valid https or http URLs", () => {
    for (const [key, url] of Object.entries(PROVIDER_DOC_URLS)) {
      expect(url, `${key} should be a valid URL`).toMatch(/^https?:\/\//);
    }
  });
});
