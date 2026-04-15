/**
 * Custom error for 401 Unauthorized responses.
 * Thrown after triggering a redirect to /login, so call sites can
 * identify auth failures if they catch before the redirect completes.
 */
import { API_BASE_URL } from "./api-config";

export class UnauthorizedError extends Error {
  constructor(message = "Session expired") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Track whether we're already checking the session to avoid loops */
let sessionCheckInFlight = false;

/**
 * Handle a 401 response intelligently.
 *
 * Instead of blindly assuming "session expired" on every 401:
 * 1. Check if the session is actually valid by hitting the auth endpoint.
 *    Uses API_BASE_URL (api.<domain>/api) — hitting the shell-relative
 *    `/api/auth/get-session` returns HTML (no shell route) → JSON parse
 *    fails → the catch arm would redirect every single 401, even when
 *    the session is fine. That broke any page that called an endpoint
 *    returning 401 for non-session reasons (e.g., billing/dividend/stats
 *    which requires a service token).
 * 2. If session IS valid — the 401 was from a permission/routing issue, not expiry.
 *    Log a warning and throw (let the caller handle it) but DON'T redirect.
 * 3. If session is truly expired — redirect to /login.
 *
 * Guards against redirect loops: if already on /login or already checking, just throws.
 */
export function handleUnauthorized(): never {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && !sessionCheckInFlight) {
    sessionCheckInFlight = true;
    fetch(`${API_BASE_URL}/auth/get-session`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        sessionCheckInFlight = false;
        if (data?.session) {
          // Session IS valid — 401 was a permission/routing issue, not expiry.
          // Do NOT redirect. Caller's UnauthorizedError throw stands.
        } else {
          const callbackUrl = window.location.pathname + window.location.search;
          const loginUrl = `/login?reason=expired&callbackUrl=${encodeURIComponent(callbackUrl)}`;
          window.location.href = loginUrl;
        }
      })
      .catch((_err) => {
        sessionCheckInFlight = false;
        const callbackUrl = window.location.pathname + window.location.search;
        const loginUrl = `/login?reason=expired&callbackUrl=${encodeURIComponent(callbackUrl)}`;
        window.location.href = loginUrl;
      });
  }
  throw new UnauthorizedError();
}
