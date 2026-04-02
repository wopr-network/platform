/**
 * Fleet route resolution — backed by platform-core's ProxyManager.
 *
 * Translates tenant subdomains to container upstream URLs using the
 * in-memory route table managed by ProxyManager. Routes are registered
 * when FleetManager creates a container and removed on teardown.
 *
 * DI-based — no singletons. Construct with deps at boot time.
 */

import { logger } from "../config/logger.js";
import type { ProxyManagerInterface, ProxyRoute } from "../proxy/types.js";

export class FleetResolver {
  constructor(private readonly proxy: ProxyManagerInterface) {}

  /** Push route table to Caddy. Logs but does not throw on failure. */
  private async syncToCaddy(): Promise<void> {
    try {
      await this.proxy.reload();
    } catch (err) {
      logger.warn("Caddy sync failed", { error: (err as Error).message });
    }
  }

  /**
   * Register a fleet container route for a tenant subdomain.
   * Called after FleetManager.create() + fleet.start().
   */
  async registerRoute(
    instanceId: string,
    subdomain: string,
    upstreamHost: string,
    upstreamPort: number,
  ): Promise<void> {
    await this.proxy.addRoute({
      instanceId,
      subdomain,
      upstreamHost,
      upstreamPort,
      healthy: true,
    });
    await this.syncToCaddy();
  }

  /** Remove a fleet container route. */
  async removeRoute(instanceId: string): Promise<void> {
    this.proxy.removeRoute(instanceId);
    await this.syncToCaddy();
  }

  /** Mark a container as healthy or unhealthy. */
  setRouteHealth(instanceId: string, healthy: boolean): void {
    this.proxy.updateHealth(instanceId, healthy);
  }

  /**
   * Resolve the upstream container URL for a tenant subdomain.
   * Returns null if no route exists or the container is unhealthy.
   */
  resolveContainerUrl(subdomain: string): string | null {
    const routes = this.proxy.getRoutes();
    const route = routes.find((r) => r.subdomain === subdomain);
    if (!route?.healthy) return null;
    return `http://${route.upstreamHost}:${route.upstreamPort}`;
  }

  /** Get all registered routes. */
  getRoutes(): ProxyRoute[] {
    return this.proxy.getRoutes();
  }
}
