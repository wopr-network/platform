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
import { mountRoutes } from "./mount-routes.js";

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

  mountRoutes(
    app,
    container,
    {
      provisionSecret: config.provisionSecret,
      cryptoServiceKey: config.cryptoServiceKey,
      platformDomain: container.productConfig.product?.domain ?? "localhost",
    },
    config.routes,
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

      server = serve({ fetch: app.fetch, hostname, port: listenPort }, async () => {
        handles = await startBackgroundServices(container);
      });
    },
    stop: async () => {
      if (server) server.close();
      if (handles) {
        await gracefulShutdown(container, handles);
      }
    },
  };
}
