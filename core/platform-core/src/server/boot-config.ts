/**
 * BootConfig — declarative configuration for platformBoot().
 *
 * Products pass a BootConfig describing which features to enable and
 * receive back a fully-wired Hono app + PlatformContainer.
 */

import type { Hono } from "hono";
import type { PlatformSecrets } from "../config/secrets.js";
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

  /**
   * Secrets resolved from Vault (production) or env fallback (local dev).
   * Call resolveSecrets(slug) before constructing BootConfig.
   */
  secrets: PlatformSecrets;

  /**
   * PostgreSQL connection string. Built from secrets.dbPassword + infra.
   * In local dev, pass DATABASE_URL directly.
   */
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

  // ---- Deprecated: use secrets instead ----
  // These remain for backward compat during migration. Once all products
  // pass secrets, these will be removed.

  /** @deprecated Use secrets.stripeSecretKey */
  stripeSecretKey?: string;

  /** @deprecated Use secrets.stripeWebhookSecret */
  stripeWebhookSecret?: string;

  /** @deprecated Use secrets.cryptoServiceKey */
  cryptoServiceKey?: string;

  /** @deprecated Use secrets.provisionSecret */
  provisionSecret?: string;
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
