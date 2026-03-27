/**
 * External provider documentation URLs used in onboarding config fields.
 *
 * These are intentional external links to provider API key dashboards —
 * no secret material. They live in code (not fetched from the API) because
 * major provider dashboard URLs change extremely rarely (years, not weeks).
 * The cost of an API round-trip, loading state, and DB migration is not
 * justified. If a URL changes, update this map and publish a new version.
 */
export const PROVIDER_DOC_URLS = {
  openai: "https://platform.openai.com/api-keys",
  openrouter: "https://openrouter.ai/keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  replicate: "https://replicate.com/account/api-tokens",
  elevenlabs: "https://elevenlabs.io/app/settings/api-keys",
  elevenlabsHome: "https://elevenlabs.io/",
  deepgram: "https://console.deepgram.com/api-keys",
  discord: "https://discord.com/developers/applications",
  slack: "https://api.slack.com/apps",
  telegram: "https://t.me/BotFather",
  whatsapp: "https://developers.facebook.com/",
  msTeams: "https://dev.teams.microsoft.com/",
  moonshot: "https://platform.moonshot.cn/",
  github: "https://github.com/settings/tokens",
  google: "https://aistudio.google.com/apikey",
  xai: "https://console.x.ai/",
  local: "https://ollama.com/download",
} as const;
