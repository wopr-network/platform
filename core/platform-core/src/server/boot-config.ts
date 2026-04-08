/**
 * BootConfig — declarative configuration for platformBoot().
 *
 * Products pass a BootConfig describing which features to enable and
 * receive back a fully-wired Hono app + PlatformContainer.
 */

import type { Hono } from "hono";
import type { IChatBackend } from "../chat/backend.js";
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
  /**
   * Phase 2.3b cut-over: route FleetManager.sendCommand through the
   * DB-as-channel queue (`OperationQueue`) instead of the WebSocket bus.
   *
   * REQUIRES every node agent in the cluster to be running an
   * `AgentWorker` (set `dbUrl` in agent config). When the flag is on but
   * an agent isn't draining the queue, every command targeted at that
   * agent will park on the row forever — by design, since the WS
   * fallback is bypassed.
   *
   * Default false. Flip after rolling out the agent dbUrl change.
   */
  agentQueueDispatch?: boolean;
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

  /**
   * Enable standalone server mode with internal auth.
   * When set, core mounts tRPC + internal service auth routes itself.
   * UI servers authenticate via service tokens in the Authorization header.
   */
  standalone?: {
    /** Comma-separated allowed service tokens for internal auth. */
    allowedServiceTokens: string;
  };

  /**
   * Chat configuration. When provided, core mounts /api/chat routes
   * (SSE streaming + message dispatch). Products provide their own
   * IChatBackend implementation.
   */
  chat?: {
    backend: IChatBackend;
  };

  /**
   * BetterAuth configuration. When provided, core initializes better-auth
   * and mounts /api/auth/* routes. Products that manage their own auth
   * externally omit this field.
   */
  auth?: {
    secret: string;
    socialProviders?: {
      github?: { clientId: string; clientSecret: string };
      google?: { clientId: string; clientSecret: string };
    };
  };

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
