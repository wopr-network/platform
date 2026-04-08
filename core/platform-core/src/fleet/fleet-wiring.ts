/**
 * Fleet wiring helpers.
 *
 * After the null-target refactor, the only wiring adapter that survives is
 * `DbInstanceLocator`. The old `FleetMembershipAdapter` (bridging
 * NodeRegistry → IFleetMembership) and `INodeConnectivity` (bridging
 * NodeConnectionManager) are both gone — there's no membership to enumerate
 * and no per-node connectivity concept in the new Fleet.
 */

import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { IInstanceLocator, InstanceLocation } from "./i-fleet.js";

/**
 * Resolves an instance ID to its owning node + product slug by reading
 * `bot_instances`. Used by `Fleet` to dispatch lifecycle ops to the agent
 * that hosts the container and to recompute the deterministic container
 * name from the slug.
 */
export class DbInstanceLocator implements IInstanceLocator {
  constructor(private readonly botInstanceRepo: IBotInstanceRepository) {}

  async locate(instanceId: string): Promise<InstanceLocation | null> {
    const row = await this.botInstanceRepo.getById(instanceId);
    if (!row?.nodeId) return null;
    return { nodeId: row.nodeId, productSlug: row.productSlug };
  }
}
