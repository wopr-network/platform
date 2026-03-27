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

/**
 * Handle a 401 response by redirecting to /login with a callbackUrl.
 * Only runs on the client (checks `typeof window`).
 * Throws UnauthorizedError after initiating redirect.
 *
 * Guards against redirect loops: if already on /login, does NOT redirect
 * again — just throws so the login page can handle the error state.
 */
export function handleUnauthorized(): never {
  if (typeof window !== "undefined") {
    if (!window.location.pathname.startsWith("/login")) {
      const callbackUrl = window.location.pathname + window.location.search;
      const loginUrl = `/login?reason=expired&callbackUrl=${encodeURIComponent(callbackUrl)}`;
      window.location.href = loginUrl;
    }
  }
  throw new UnauthorizedError();
}
