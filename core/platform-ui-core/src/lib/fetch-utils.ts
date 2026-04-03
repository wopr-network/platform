/**
 * Custom error for 401 Unauthorized responses.
 * Thrown after triggering a redirect to /login, so call sites can
 * identify auth failures if they catch before the redirect completes.
 */
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
 * 1. Check if the session is actually valid by hitting the auth endpoint
 * 2. If session IS valid — the 401 was from a permission/routing issue, not expiry.
 *    Log a warning and throw (let the caller handle it) but DON'T redirect.
 * 3. If session is truly expired — redirect to /login.
 *
 * Guards against redirect loops: if already on /login or already checking, just throws.
 */
export function handleUnauthorized(): never {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && !sessionCheckInFlight) {
    sessionCheckInFlight = true;

    // Check session validity before redirecting
    console.warn("[auth] 401 received on", window.location.pathname, "— verifying session...");
    fetch("/api/auth/get-session", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        sessionCheckInFlight = false;
        if (data?.session) {
          // Session is valid — this 401 is NOT a session expiry
          console.warn("[auth] session IS valid (userId:", data.session.userId, ") — 401 is from a missing endpoint or permission issue, NOT session expiry. Staying on page.");
        } else {
          // Session truly expired — redirect to login
          console.warn("[auth] session is expired — redirecting to login");
          const callbackUrl = window.location.pathname + window.location.search;
          const loginUrl = `/login?reason=expired&callbackUrl=${encodeURIComponent(callbackUrl)}`;
          window.location.href = loginUrl;
        }
      })
      .catch((err) => {
        sessionCheckInFlight = false;
        console.warn("[auth] failed to verify session:", err.message, "— assuming expired");
        const callbackUrl = window.location.pathname + window.location.search;
        const loginUrl = `/login?reason=expired&callbackUrl=${encodeURIComponent(callbackUrl)}`;
        window.location.href = loginUrl;
      });
  }
  throw new UnauthorizedError();
}
