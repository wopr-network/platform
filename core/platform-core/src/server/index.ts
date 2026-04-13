/**
 * platform-core server entry point.
 *
 * Re-exports types, the test helper, and provides bootPlatformServer() —
 * the single-call boot function products use to go from a declarative
 * BootConfig to a running Hono server with DI container.
 */

import { Hono } from "hono";
import type { BootConfig, BootResult } from "./boot-config.js";
import { buildContainer } from "./container.js";
import { type BackgroundHandles, gracefulShutdown, startBackgroundServices } from "./lifecycle.js";
import { createTenantProxyUpgradeHandler } from "./middleware/tenant-proxy.js";
import { buildTenantProxyResolveUser, mountRoutes } from "./mount-routes.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { BootConfig, BootResult, FeatureFlags, RoutePlugin } from "./boot-config.js";
export type {
  CryptoServices,
  FleetServices,
  GatewayServices,
  HotPoolServices,
  PlatformContainer,
  StripeServices,
} from "./container.js";
export { buildContainer } from "./container.js";
export { type BackgroundHandles, gracefulShutdown, startBackgroundServices } from "./lifecycle.js";
export { type MountConfig, mountRoutes } from "./mount-routes.js";
export { createTestContainer } from "./test-container.js";

// ---------------------------------------------------------------------------
// bootPlatformServer
// ---------------------------------------------------------------------------

/**
 * Boot a fully-wired platform server from a declarative config.
 *
 * 1. Builds the DI container (DB, migrations, product config, feature slices)
 * 2. Creates a Hono app and mounts shared routes
 * 3. Returns start/stop lifecycle hooks
 *
 * Products call this from their index.ts:
 * ```ts
 * const { app, container, start, stop } = await bootPlatformServer({
 *   slug: "paperclip",
 *   databaseUrl: process.env.DATABASE_URL!,
 *   provisionSecret: process.env.PROVISION_SECRET!,
 *   features: { fleet: true, crypto: true, stripe: true, gateway: true, hotPool: false },
 * });
 * await start();
 * ```
 */
export async function bootPlatformServer(config: BootConfig): Promise<BootResult> {
  const container = await buildContainer(config);
  const app = new Hono();

  const secrets = config.secrets;

  // Initialize email client from Vault secrets before auth routes are mounted
  if (secrets?.resendApiKey) {
    const { getEmailClient } = await import("../email/client.js");
    getEmailClient({
      resendApiKey: secrets.resendApiKey,
      from: container.productConfig.product?.fromEmail || undefined,
      replyTo: container.productConfig.product?.emailSupport || undefined,
    });
  }
  await mountRoutes(
    app,
    container,
    {
      provisionSecret: secrets?.provisionSecret ?? config.provisionSecret ?? "",
      cryptoServiceKey: secrets?.cryptoServiceKey ?? config.cryptoServiceKey,
      openrouterApiKey: secrets?.openrouterApiKey,
      platformDomain: container.productConfig.product?.domain ?? "localhost",
    },
    config.routes,
    config.standalone || config.auth || config.chat
      ? {
          standalone: config.standalone,
          auth: config.auth,
          chat: config.chat,
          slug: config.slug,
          secrets: config.secrets,
          databaseUrl: config.databaseUrl,
        }
      : undefined,
  );

  let handles: BackgroundHandles | null = null;
  let server: { close: () => void } | null = null;

  return {
    app,
    container,
    start: async (port?: number) => {
      const { serve } = await import("@hono/node-server");
      const listenPort = port ?? config.port ?? 3001;
      const hostname = config.host ?? "0.0.0.0";

      const httpServer = serve({ fetch: app.fetch, hostname, port: listenPort }, async () => {
        handles = await startBackgroundServices(container);
      });
      // Proxy WebSocket upgrades on /_sidecar/* through to the user's
      // container. Hono's fetch-based middleware can't handle upgrades, so
      // we hook the underlying Node http.Server's upgrade event directly.
      // Live-run transcripts + sidebar live counts depend on this working.
      if (container.fleet) {
        const resolveUser = buildTenantProxyResolveUser(container);
        const upgradeHandler = createTenantProxyUpgradeHandler(container, { resolveUser });
        // `serve()` from @hono/node-server returns a Node http.Server (or
        // http2 server). In http.Server mode it emits 'upgrade'; ignore if
        // the event isn't supported (tests, custom runtimes).
        const ee = httpServer as unknown as { on?: (event: string, handler: (...args: unknown[]) => void) => void };
        if (typeof ee.on === "function") {
          ee.on("upgrade", upgradeHandler as (...args: unknown[]) => void);
        }
      }
      server = httpServer;
    },
    stop: async () => {
      if (server) server.close();
      if (handles) {
        await gracefulShutdown(container, handles);
      }
    },
  };
}
