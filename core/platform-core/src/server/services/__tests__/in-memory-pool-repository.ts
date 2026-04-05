/**
 * In-memory IPoolRepository for testing.
 * FIFO claiming, dead instance handling — no DB required.
 * Supports partitioned pool instances.
 */

import type { IPoolRepository, PoolInstance, PoolInstanceStatus } from "../pool-repository.js";

export class InMemoryPoolRepository implements IPoolRepository {
  private poolSizes = new Map<string, number>();
  private instances: Array<{
    partition: string | null;
    image: string | null;
    id: string;
    containerId: string;
    status: PoolInstanceStatus;
    createdAt: Date;
    claimedAt: Date | null;
  }> = [];

  async getPoolSize(partition?: string): Promise<number> {
    return this.poolSizes.get(partition ?? "__default__") ?? 2;
  }

  async setPoolSize(size: number, partition?: string): Promise<void> {
    this.poolSizes.set(partition ?? "__default__", size);
  }

  async warmCount(partition?: string): Promise<number> {
    return this.instances.filter((i) => i.status === "warm" && (!partition || i.partition === partition)).length;
  }

  async insertWarm(id: string, containerId: string, partition?: string, image?: string): Promise<void> {
    this.instances.push({
      id,
      containerId,
      status: "warm",
      partition: partition ?? null,
      image: image ?? null,
      createdAt: new Date(),
      claimedAt: null,
    });
  }

  async listActive(partition?: string): Promise<PoolInstance[]> {
    return this.instances
      .filter((i) => i.status !== "dead" && (!partition || i.partition === partition))
      .map(({ createdAt, claimedAt, ...rest }) => rest);
  }

  async markDead(id: string): Promise<void> {
    const inst = this.instances.find((i) => i.id === id);
    if (inst) inst.status = "dead";
  }

  async deleteDead(): Promise<void> {
    this.instances = this.instances.filter((i) => i.status !== "dead");
  }

  async claim(partition?: string): Promise<{ id: string; containerId: string } | null> {
    const warm = this.instances
      .filter((i) => i.status === "warm" && (!partition || i.partition === partition))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (warm.length === 0) return null;
    const target = warm[0];
    target.status = "claimed";
    target.claimedAt = new Date();
    return { id: target.id, containerId: target.containerId };
  }

  async updateInstanceStatus(id: string, status: PoolInstanceStatus): Promise<void> {
    const inst = this.instances.find((i) => i.id === id);
    if (inst) inst.status = status;
  }
}
