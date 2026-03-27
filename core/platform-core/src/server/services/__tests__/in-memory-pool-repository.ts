/**
 * In-memory IPoolRepository for testing.
 * FIFO claiming, dead instance handling — no DB required.
 */

import type { IPoolRepository, PoolInstance } from "../pool-repository.js";

export class InMemoryPoolRepository implements IPoolRepository {
  private poolSize = 2;
  private instances: Array<PoolInstance & { createdAt: Date; claimedAt: Date | null }> = [];

  async getPoolSize(): Promise<number> {
    return this.poolSize;
  }

  async setPoolSize(size: number): Promise<void> {
    this.poolSize = size;
  }

  async warmCount(): Promise<number> {
    return this.instances.filter((i) => i.status === "warm").length;
  }

  async insertWarm(id: string, containerId: string): Promise<void> {
    this.instances.push({
      id,
      containerId,
      status: "warm",
      tenantId: null,
      name: null,
      createdAt: new Date(),
      claimedAt: null,
    });
  }

  async listWarm(): Promise<PoolInstance[]> {
    return this.instances.filter((i) => i.status === "warm").map(({ createdAt, claimedAt, ...rest }) => rest);
  }

  async markDead(id: string): Promise<void> {
    const inst = this.instances.find((i) => i.id === id);
    if (inst) inst.status = "dead";
  }

  async deleteDead(): Promise<void> {
    this.instances = this.instances.filter((i) => i.status !== "dead");
  }

  async claimWarm(tenantId: string, name: string): Promise<{ id: string; containerId: string } | null> {
    const warm = this.instances
      .filter((i) => i.status === "warm")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (warm.length === 0) return null;
    const target = warm[0];
    target.status = "claimed";
    target.tenantId = tenantId;
    target.name = name;
    target.claimedAt = new Date();
    return { id: target.id, containerId: target.containerId };
  }

  async updateInstanceStatus(id: string, status: string): Promise<void> {
    const inst = this.instances.find((i) => i.id === id);
    if (inst) inst.status = status;
  }
}
