import type { Request, RequestHandler } from "express";
import { logger } from "./logger.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_DEV_ORIGINS = ["http://localhost:3100", "http://127.0.0.1:3100"];

function parseOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function trustedOriginsForRequest(req: Request) {
  const origins = new Set(DEFAULT_DEV_ORIGINS.map((value) => value.toLowerCase()));
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.header("host")?.trim();
  if (host) {
    origins.add(`http://${host}`.toLowerCase());
    origins.add(`https://${host}`.toLowerCase());
  }
  return origins;
}

function isTrustedBoardMutationRequest(req: Request) {
  const allowedOrigins = trustedOriginsForRequest(req);
  const origin = parseOrigin(req.header("origin"));
  if (origin && allowedOrigins.has(origin)) return true;

  const refererOrigin = parseOrigin(req.header("referer"));
  if (refererOrigin && allowedOrigins.has(refererOrigin)) return true;

  return false;
}

export function boardMutationGuard(): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    if (req.actor.type !== "board") {
      next();
      return;
    }

    // Local-trusted mode and board bearer keys are not browser-session requests.
    // In these modes, origin/referer headers can be absent; do not block those mutations.
    // In hosted_proxy mode the platform proxies requests — origin headers may not match.
    // Check the x-platform-user-id header (injected by tenant proxy) as the hosted indicator.
    if (req.header("x-platform-user-id") || req.header("x-paperclip-user-id")) {
      next();
      return;
    }

    if (req.actor.source === "local_implicit" || req.actor.source === "board_key") {
      next();
      return;
    }

    if (!isTrustedBoardMutationRequest(req)) {
      logger.warn(
        {
          method: req.method,
          url: req.originalUrl,
          origin: req.header("origin") ?? "(none)",
          referer: req.header("referer") ?? "(none)",
          host: req.header("host") ?? "(none)",
          actorSource: req.actor.source,
        },
        "Board mutation blocked — untrusted origin",
      );
      res.status(403).json({ error: "Board mutation requires trusted browser origin" });
      return;
    }

    next();
  };
}
