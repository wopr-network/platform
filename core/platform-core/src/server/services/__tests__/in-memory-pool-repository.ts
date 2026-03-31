/**
 * In-memory IPoolRepository for testing.
 * FIFO claiming, dead instance handling — no DB required.
 * Supports per-product pool partitioning.
 */

import type { IPoolRepository, PoolInstance } from "../pool-repository.js";

export class InMemoryPoolRepository implements IPoolRepository {
  private poolSizes = new Map<string, number>();
  private instances: Array<PoolInstance & { createdAt: Date; claimedAt: Date | null }> = [];

  async getPoolSize(productSlug?: string): Promise<number> {
    return this.poolSizes.get(productSlug ?? "__default__") ?? 2;
  }

  async setPoolSize(size: number, productSlug?: string): Promise<void> {
    this.poolSizes.set(productSlug ?? "__default__", size);
  }

  async warmCount(productSlug?: string): Promise<number> {
    return this.instances.filter((i) => i.status === "warm" && (!productSlug || i.productSlug === productSlug)).length;
  }

  async insertWarm(id: string, containerId: string, productSlug?: string, image?: string): Promise<void> {
    this.instances.push({
      id,
      containerId,
      status: "warm",
      tenantId: null,
      name: null,
      productSlug: productSlug ?? null,
      image: image ?? null,
      createdAt: new Date(),
      claimedAt: null,
    });
  }

  async listWarm(productSlug?: string): Promise<PoolInstance[]> {
    return this.instances
      .filter((i) => i.status === "warm" && (!productSlug || i.productSlug === productSlug))
      .map(({ createdAt, claimedAt, ...rest }) => rest);
  }

  async markDead(id: string): Promise<void> {
    const inst = this.instances.find((i) => i.id === id);
    if (inst) inst.status = "dead";
  }

  async deleteDead(): Promise<void> {
    this.instances = this.instances.filter((i) => i.status !== "dead");
  }

  async claimWarm(
    tenantId: string,
    name: string,
    productSlug?: string,
  ): Promise<{ id: string; containerId: string } | null> {
    const warm = this.instances
      .filter((i) => i.status === "warm" && (!productSlug || i.productSlug === productSlug))
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
