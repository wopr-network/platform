import type { Provider } from "../security/types.js";

/**
 * Base API URLs used to validate provider keys.
 * Centralised here so every consumer references one source of truth.
 *
 * Each URL can be overridden via env var for proxied / air-gapped / self-hosted deployments:
 *   ANTHROPIC_API_URL, OPENAI_API_URL, GOOGLE_API_URL,
 *   DISCORD_API_URL, ELEVENLABS_API_URL, DEEPGRAM_API_URL
 */
export const PROVIDER_API_URLS: Record<Provider, string> = {
  anthropic: process.env.ANTHROPIC_API_URL || "https://api.anthropic.com/v1/models",
  openai: process.env.OPENAI_API_URL || "https://api.openai.com/v1/models",
  google: process.env.GOOGLE_API_URL || "https://generativelanguage.googleapis.com/v1/models",
  discord: process.env.DISCORD_API_URL || "https://discord.com/api/v10/users/@me",
  elevenlabs: process.env.ELEVENLABS_API_URL || "https://api.elevenlabs.io/v1/user",
  deepgram: process.env.DEEPGRAM_API_URL || "https://api.deepgram.com/v1/projects",
};
