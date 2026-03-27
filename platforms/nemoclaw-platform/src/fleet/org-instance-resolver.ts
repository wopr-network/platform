/**
 * Resolves a platform org to its managed container instance.
 *
 * Looks up the BotProfile by tenantId, then resolves the upstream
 * container URL from the ProxyManager route table and the managed
 * companyId from the profile's COMPANY_ID env var.
 */

import { logger } from "@wopr-network/platform-core/config/logger";
import type { IProfileStore } from "@wopr-network/platform-core/fleet/profile-store";
import type { ProxyManagerInterface } from "@wopr-network/platform-core/proxy/types";

export interface OrgInstance {
  instanceUrl: string;
  companyId: string;
}

let _profileStore: IProfileStore | null = null;
let _proxyManager: ProxyManagerInterface | null = null;

export function setOrgInstanceResolverDeps(profileStore: IProfileStore, proxyManager: ProxyManagerInterface): void {
  _profileStore = profileStore;
  _proxyManager = proxyManager;
}

function getProfileStore(): IProfileStore {
  if (!_profileStore) throw new Error("OrgInstanceResolver profileStore not initialized");
  return _profileStore;
}

function getProxyManager(): ProxyManagerInterface {
  if (!_proxyManager) throw new Error("OrgInstanceResolver proxyManager not initialized");
  return _proxyManager;
}

/**
 * Find the running managed instance for an org.
 * Returns null if no instance exists or the container is unhealthy.
 */
export async function resolveOrgInstance(orgId: string): Promise<OrgInstance | null> {
  const store = getProfileStore();
  const profiles = await store.list();
  const profile = profiles.find((p) => p.tenantId === orgId);
  if (!profile) {
    logger.debug("No fleet profile found for org", { orgId });
    return null;
  }

  const companyId = profile.env?.COMPANY_ID;
  if (!companyId) {
    logger.debug("Fleet profile missing COMPANY_ID", { orgId, profileId: profile.id });
    return null;
  }

  const routes = getProxyManager().getRoutes();
  const route = routes.find((r) => r.instanceId === profile.id);
  if (!route || !route.healthy) {
    logger.debug("No healthy route for fleet profile", { orgId, profileId: profile.id });
    return null;
  }

  return {
    instanceUrl: `http://${route.upstreamHost}:${route.upstreamPort}`,
    companyId,
  };
}
