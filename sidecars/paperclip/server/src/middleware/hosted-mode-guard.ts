import type { Request, RequestHandler } from "express";
import { forbidden } from "../errors.js";

/**
 * Middleware to prevent infrastructure/admin operations in hostedMode.
 *
 * In hosted_proxy mode, certain operations should only be allowed through
 * the platform's provision protocol, not through direct API access. This includes:
 * - Company deletion
 * - Instance settings changes
 * - Plugin management
 * - Secrets management (creation/deletion)
 *
 * The deploymentMode is passed via the createApp options and is available
 * in the request locals (set by the app initialization).
 */
export function hostedModeGuard(opts?: { operation?: string }): RequestHandler {
  return (req, res, next) => {
    // deploymentMode is injected by app.ts during initialization
    const deploymentMode = req.app.locals?.deploymentMode;

    // Guard only applies to hosted_proxy mode
    if (deploymentMode !== "hosted_proxy") {
      next();
      return;
    }

    // Disallow the operation in hosted mode
    const operationName = opts?.operation || "This operation";
    throw forbidden(`${operationName} is not allowed in hosted mode`);
  };
}
