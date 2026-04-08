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
import type { IInstanceLocator } from "./i-fleet.js";

/**
 * Resolves an instance ID to its owning node by reading
 * `bot_instances.node_id`. Used by `Fleet` to dispatch lifecycle ops
 * (remove, status, logs) to the agent that hosts the container.
 */
export class DbInstanceLocator implements IInstanceLocator {
  constructor(private readonly botInstanceRepo: IBotInstanceRepository) {}

  async findNodeFor(instanceId: string): Promise<string | null> {
    const row = await this.botInstanceRepo.getById(instanceId);
    return row?.nodeId ?? null;
  }
}
