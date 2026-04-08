/**
 * Wiring helpers — adapters that connect the existing NodeRegistry +
 * NodeConnectionManager + repositories to the abstract Fleet composite.
 *
 * Keeps the Fleet class decoupled from concrete registry/connection
 * implementations: those are platform-specific, the composite logic is not.
 */

import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { IFleetMembership } from "./fleet.js";
import type { IInstanceLocator, INodeFleet } from "./i-fleet.js";
import type { NodeRegistry } from "./node-registry.js";

/**
 * Connection-state interface — just the methods Fleet needs from
 * NodeConnectionManager. Letting Fleet depend on this rather than the full
 * NodeConnectionManager keeps the boundary thin and tests easy.
 */
export interface INodeConnectivity {
  isConnected(nodeId: string): boolean;
}

/**
 * Adapter: presents NodeRegistry + NodeConnectionManager as the
 * IFleetMembership interface that Fleet consumes.
 */
export class FleetMembershipAdapter implements IFleetMembership {
  constructor(
    private readonly registry: NodeRegistry,
    private readonly connectivity: INodeConnectivity,
  ) {}

  list(): INodeFleet[] {
    // NodeRegistry.list() returns NodeEntry[]; FleetManager (entry.fleet) implements INodeFleet.
    return this.registry.list().map((e) => e.fleet as unknown as INodeFleet);
  }

  isConnected(nodeId: string): boolean {
    return this.connectivity.isConnected(nodeId);
  }

  getContainerCounts(): Promise<Map<string, number>> {
    return this.registry.getContainerCounts();
  }

  getNodeMetrics(): Promise<Map<string, { capacityMb: number; usedMb: number; status: string }>> {
    return this.registry.getNodeMetrics() as unknown as Promise<
      Map<string, { capacityMb: number; usedMb: number; status: string }>
    >;
  }
}

/**
 * IInstanceLocator backed by IBotInstanceRepository. Reads node_id from the
 * bot_instances row — DB is the source of truth, no in-memory cache.
 */
export class DbInstanceLocator implements IInstanceLocator {
  constructor(private readonly botInstanceRepo: IBotInstanceRepository) {}

  async findNodeFor(instanceId: string): Promise<string | null> {
    const row = await this.botInstanceRepo.getById(instanceId);
    return row?.nodeId ?? null;
  }
}
