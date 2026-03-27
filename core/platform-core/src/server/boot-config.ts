/**
 * BootConfig — declarative configuration for platformBoot().
 *
 * Products pass a BootConfig describing which features to enable and
 * receive back a fully-wired Hono app + PlatformContainer.
 */

import type { Hono } from "hono";
import type { PlatformContainer } from "./container.js";

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export interface FeatureFlags {
  fleet: boolean;
  crypto: boolean;
  stripe: boolean;
  gateway: boolean;
  hotPool: boolean;
}

// ---------------------------------------------------------------------------
// Route plugins
// ---------------------------------------------------------------------------

export interface RoutePlugin {
  path: string;
  handler: (container: PlatformContainer) => Hono;
}

// ---------------------------------------------------------------------------
// Boot config
// ---------------------------------------------------------------------------

export interface BootConfig {
  /** Short product identifier (e.g. "paperclip", "wopr", "holyship"). */
  slug: string;

  /** PostgreSQL connection string. Required unless `pool` is provided. */
  databaseUrl: string;

  /**
   * Pre-created PostgreSQL connection pool. When provided, buildContainer
   * reuses this pool and skips pool creation + Drizzle migrations. The
   * caller is responsible for running their own migrations before calling
   * buildContainer.
   *
   * Use this when the product has its own migration set (e.g. wopr-platform
   * generates migrations locally from the shared schema).
   */
  pool?: import("pg").Pool;

  /** Bind host (default "0.0.0.0"). */
  host?: string;

  /** Bind port (default 3001). */
  port?: number;

  /** Which optional feature slices to wire up. */
  features: FeatureFlags;

  /** Additional Hono sub-apps mounted after core routes. */
  routes?: RoutePlugin[];

  /** Required when features.stripe is true. */
  stripeSecretKey?: string;

  /** Required when features.stripe is true. */
  stripeWebhookSecret?: string;

  /** Service key for the crypto chain server webhook endpoint. */
  cryptoServiceKey?: string;

  /** Shared secret used to authenticate provision requests. */
  provisionSecret: string;
}

// ---------------------------------------------------------------------------
// Boot result
// ---------------------------------------------------------------------------

export interface BootResult {
  /** The fully-wired Hono application. */
  app: Hono;

  /** The assembled DI container — useful for tests and ad-hoc access. */
  container: PlatformContainer;

  /** Start listening. Uses BootConfig.port unless overridden. */
  start: (port?: number) => Promise<void>;

  /** Graceful shutdown: drain connections, close pool. */
  stop: () => Promise<void>;
}
