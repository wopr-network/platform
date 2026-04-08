/**
 * Resolves a platform org to its managed container instance(s).
 *
 * Looks up BotProfiles by tenantId, resolves the upstream container URL
 * via the Fleet composite (which dispatches to the owning node), and
 * reads the company ID from the profile's PAPERCLIP_COMPANY_ID env var.
 *
 * DI-based — no singletons. Construct with deps at boot time.
 */

import { logger } from "../config/logger.js";
import type { IFleet } from "./i-fleet.js";
import type { IProfileStore } from "./profile-store.js";

export interface OrgInstance {
  instanceUrl: string;
  companyId: string;
}

export interface OrgInstanceResolverDeps {
  profileStore: IProfileStore;
}

export class OrgInstanceResolver {
  private fleet: IFleet | null = null;

  constructor(private readonly deps: OrgInstanceResolverDeps) {}

  /** Inject the Fleet composite after construction (boots before fleetComposite exists). */
  setFleet(fleet: IFleet): void {
    this.fleet = fleet;
  }

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
    if (!this.fleet) {
      logger.warn("OrgInstanceResolver: fleet not wired, returning empty", { orgId });
      return [];
    }
    const profiles = await this.deps.profileStore.list();
    const orgProfiles = profiles.filter((p) => p.tenantId === orgId);
    if (orgProfiles.length === 0) {
      logger.debug("No fleet profiles found for org", { orgId });
      return [];
    }

    const instances: OrgInstance[] = [];
    for (const profile of orgProfiles) {
      const companyId = profile.env?.PAPERCLIP_COMPANY_ID;
      if (!companyId) {
        logger.debug("Fleet profile missing PAPERCLIP_COMPANY_ID", { orgId, profileId: profile.id });
        continue;
      }
      try {
        const instance = await this.fleet.getInstance(profile.id);
        instances.push({ instanceUrl: instance.url, companyId });
      } catch (err) {
        logger.debug("Fleet.getInstance failed for org profile", {
          orgId,
          profileId: profile.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return instances;
  }
}
