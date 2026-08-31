import type { Request, RequestHandler } from "express";
import { forbidden } from "../errors.js";

/**
 * Middleware to prevent infrastructure/admin operations in hostedMode.
 *
 * In hosted mode (hostedMode=true), certain operations should only be allowed through
 * the platform's provision protocol, not through direct API access. This includes:
 * - Company deletion
 * - Instance settings changes
 * - Plugin management
 * - Secrets management (creation/deletion)
 * - Company import/export
 *
 * The hostedMode flag is passed via the createApp options and is available
 * in the request locals (set by the app initialization).
 */
export function hostedModeGuard(opts?: { operation?: string }): RequestHandler {
  return (req, res, next) => {
    // hostedMode is injected by app.ts during initialization
    const hostedMode = req.app.locals?.hostedMode;

    // Guard only applies to hosted mode
    if (!hostedMode) {
      next();
      return;
    }

    // Disallow the operation in hosted mode
    const operationName = opts?.operation || "This operation";
    throw forbidden(`${operationName} is not allowed in hosted mode`);
  };
}
