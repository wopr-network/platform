/**
 * In-memory route table: tenant subdomain → container upstream URL.
 *
 * In production, populate via fleet events (container provisioned/destroyed).
 * Can be replaced with a DB-backed implementation by implementing RouteResolver.
 */

export interface RouteEntry {
  subdomain: string;
  upstreamUrl: string;
  healthy: boolean;
}

/**
 * Interface for resolving container URLs from subdomains.
 * Implement this to back the route table with a database.
 */
export interface RouteResolver {
  resolve(subdomain: string): Promise<string | null>;
  list(): RouteEntry[];
}

/**
 * Default in-memory route table.
 * Fine for single-process deployments; replace with DB-backed
 * implementation for multi-process.
 */
export class MemoryRouteTable implements RouteResolver {
  private routes = new Map<string, { upstreamUrl: string; healthy: boolean }>();

  register(subdomain: string, upstreamUrl: string): void {
    this.routes.set(subdomain, { upstreamUrl, healthy: true });
  }

  remove(subdomain: string): void {
    this.routes.delete(subdomain);
  }

  setHealth(subdomain: string, healthy: boolean): void {
    const entry = this.routes.get(subdomain);
    if (entry) entry.healthy = healthy;
  }

  async resolve(subdomain: string): Promise<string | null> {
    const entry = this.routes.get(subdomain);
    if (!entry || !entry.healthy) return null;
    return entry.upstreamUrl;
  }

  list(): RouteEntry[] {
    return Array.from(this.routes.entries()).map(([subdomain, entry]) => ({
      subdomain,
      ...entry,
    }));
  }
}
