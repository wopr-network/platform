import { Hono } from "hono";
import type { Pool } from "pg";
import { logger } from "../../config/logger.js";
import type { ILedger } from "../../credits/index.js";
import { grantSignupCredits } from "../../credits/index.js";
import { getEmailClient } from "../../email/client.js";
import { verifyToken, welcomeTemplate } from "../../email/index.js";

export interface VerifyEmailRouteDeps {
  pool: Pool;
  creditLedger: ILedger;
}

export interface VerifyEmailRouteConfig {
  /** UI origin for redirect URLs (default: http://localhost:3001) */
  uiOrigin?: string;
}

/**
 * Create verify-email routes with explicit dependencies (for testing).
 */
export function createVerifyEmailRoutes(deps: VerifyEmailRouteDeps, config?: VerifyEmailRouteConfig): Hono {
  return buildRoutes(
    () => deps.pool,
    () => deps.creditLedger,
    config,
  );
}

/**
 * Create verify-email routes with factory functions (for lazy init).
 */
export function createVerifyEmailRoutesLazy(
  poolFactory: () => Pool,
  creditLedgerFactory: () => ILedger,
  config?: VerifyEmailRouteConfig,
): Hono {
  return buildRoutes(poolFactory, creditLedgerFactory, config);
}

function buildRoutes(
  poolFactory: () => Pool,
  creditLedgerFactory: () => ILedger,
  config?: VerifyEmailRouteConfig,
): Hono {
  const uiOrigin = config?.uiOrigin ?? process.env.UI_ORIGIN ?? "http://localhost:3001";
  const routes = new Hono();

  routes.get("/verify", async (c) => {
    const token = c.req.query("token");

    if (!token) {
      return c.redirect(`${uiOrigin}/auth/verify?status=error&reason=missing_token`);
    }

    const pool = poolFactory();
    const result = await verifyToken(pool, token);

    if (!result) {
      return c.redirect(`${uiOrigin}/auth/verify?status=error&reason=invalid_or_expired`);
    }

    // Grant $5 signup credit (idempotent — safe on link re-click)
    try {
      const ledger = creditLedgerFactory();
      const granted = await grantSignupCredits(ledger, result.userId);
      if (granted) {
        logger.info("Signup credit granted", { userId: result.userId });
      } else {
        logger.info("Signup credit already granted, skipping", { userId: result.userId });
      }
    } catch (err) {
      logger.error("Failed to grant signup credit", {
        userId: result.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Don't block verification if credit grant fails
    }

    // Send welcome email
    try {
      const emailClient = getEmailClient();
      const template = welcomeTemplate(result.email);
      await emailClient.send({
        to: result.email,
        ...template,
        userId: result.userId,
        templateName: "welcome",
      });
    } catch (err) {
      logger.error("Failed to send welcome email", {
        userId: result.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Don't block verification if welcome email fails
    }

    return c.redirect(`${uiOrigin}/auth/verify?status=success`);
  });

  return routes;
}
