import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract: every prefix in `IFRAME_PREFIXES` must have a matching Next.js
 * route under `(dashboard)/`, otherwise a hard refresh on that path 404s
 * before the shell layout mounts and the sidecar iframe never renders.
 *
 * The route doesn't need to be a file named `<prefix>/page.tsx` exactly —
 * a dynamic segment (`[[...slug]]/page.tsx`) or a parent route that owns
 * this prefix is also valid. We verify by checking that *some* page.tsx
 * exists under the prefix directory.
 */
const DASHBOARD_DIR = resolve(__dirname, "../app/(dashboard)");

async function loadIframePrefixes(): Promise<readonly string[]> {
  const mod = await import("@core/lib/sidecar-routes");
  return mod.IFRAME_PREFIXES;
}

function hasRoute(prefix: string): boolean {
  // strip leading slash and optional trailing slash
  const rel = prefix.replace(/^\/+/, "").replace(/\/+$/, "");
  const base = resolve(DASHBOARD_DIR, rel);
  if (!existsSync(base)) return false;
  if (existsSync(resolve(base, "page.tsx"))) return true;
  if (existsSync(resolve(base, "[[...slug]]", "page.tsx"))) return true;
  if (existsSync(resolve(base, "[...slug]", "page.tsx"))) return true;
  return false;
}

describe("IFRAME_PREFIXES ↔ (dashboard) route parity", () => {
  it("every iframe prefix has a matching Next.js route so hard refresh does not 404", async () => {
    const prefixes = await loadIframePrefixes();
    const missing = prefixes.filter((p) => !hasRoute(p));
    expect(missing, `Missing (dashboard) routes for IFRAME_PREFIXES: ${missing.join(", ")}`).toEqual([]);
  });
});
