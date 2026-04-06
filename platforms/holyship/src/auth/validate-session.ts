/**
 * Session validation — forwards cookies to core's BetterAuth endpoint.
 *
 * Holyship does NOT run its own auth. It validates sessions by asking core.
 */

export interface SessionUser {
  id: string;
  name?: string;
  email?: string;
  image?: string | null;
}

export interface SessionData {
  user: SessionUser;
  session: { id: string; expiresAt: string };
}

let _coreUrl: string | undefined;

export function setCoreUrl(url: string): void {
  _coreUrl = url;
}

function coreUrl(): string {
  if (!_coreUrl) throw new Error("Core URL not set — call setCoreUrl() at boot");
  return _coreUrl;
}

/**
 * Validate a request's session by forwarding cookies to core's auth API.
 * Returns session data if valid, null otherwise.
 */
export async function validateSession(req: Request): Promise<SessionData | null> {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;

  try {
    const res = await fetch(`${coreUrl()}/api/auth/get-session`, {
      headers: {
        Cookie: cookie,
        "X-Product": "holyship",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SessionData;
    return data?.user ? data : null;
  } catch {
    return null;
  }
}
