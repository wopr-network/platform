/**
 * Resolves a platform org to its managed container instance(s).
 *
 * Looks up BotProfiles by tenantId, then resolves the upstream
 * container URL from the proxy route table and the company ID
 * from the profile's PAPERCLIP_COMPANY_ID env var.
 *
 * DI-based — no singletons. Construct with deps at boot time.
 */

import { logger } from "../config/logger.js";
import type { ProxyManagerInterface } from "../proxy/types.js";
import type { IProfileStore } from "./profile-store.js";

export interface OrgInstance {
  instanceUrl: string;
  companyId: string;
}

export interface OrgInstanceResolverDeps {
  profileStore: IProfileStore;
  proxyManager: ProxyManagerInterface;
}

export class OrgInstanceResolver {
  constructor(private readonly deps: OrgInstanceResolverDeps) {}

  /**
   * Find the running managed instance for an org.
   * Returns null if no instance exists or the container is unhealthy.
   *
   * @deprecated Use {@link resolveAll} — an org can own multiple instances.
   */
  async resolve(orgId: string): Promise<OrgInstance | null> {
    const instances = await this.resolveAll(orgId);
    return instances[0] ?? null;
  }

  /**
   * Find ALL running managed instances for an org.
   * An org can own multiple instances — member changes must sync to every one.
   */
  async resolveAll(orgId: string): Promise<OrgInstance[]> {
    const profiles = await this.deps.profileStore.list();
    const orgProfiles = profiles.filter((p) => p.tenantId === orgId);
    if (orgProfiles.length === 0) {
      logger.debug("No fleet profiles found for org", { orgId });
      return [];
    }

    const routes = this.deps.proxyManager.getRoutes();
    const instances: OrgInstance[] = [];

    for (const profile of orgProfiles) {
      const companyId = profile.env?.PAPERCLIP_COMPANY_ID;
      if (!companyId) {
        logger.debug("Fleet profile missing PAPERCLIP_COMPANY_ID", { orgId, profileId: profile.id });
        continue;
      }

      const route = routes.find((r) => r.instanceId === profile.id);
      if (!route || !route.healthy) {
        logger.debug("No healthy route for fleet profile", { orgId, profileId: profile.id });
        continue;
      }

      instances.push({
        instanceUrl: `http://${route.upstreamHost}:${route.upstreamPort}`,
        companyId,
      });
    }

    return instances;
  }
}
