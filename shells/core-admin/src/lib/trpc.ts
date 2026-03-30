const CORE_API_URL = process.env.INTERNAL_API_URL ?? "http://core:3001";
const SERVICE_TOKEN = process.env.CORE_SERVICE_TOKEN ?? "";

const TIMEOUT = 15_000;

/**
 * Internal admin fetch helper.
 * Sends service auth headers + X-Product: admin on every request.
 */
export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CORE_API_URL}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(TIMEOUT),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_TOKEN}`,
      "X-Product": "admin",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Core API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}
