// Thin wrapper — delegates to platform-core bot plugin routes.
// WOPR-specific wiring is injected at mount time in app.ts.

export {
  type BotPluginDeps,
  createBotPluginRoutes,
} from "@wopr-network/platform-core/api/routes/bot-plugins";
