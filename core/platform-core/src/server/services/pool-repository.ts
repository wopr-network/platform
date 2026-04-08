/**
 * Repository for hot pool database operations.
 *
 * Pure Drizzle — no raw SQL. Schema is the single source of truth.
 */

import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { PlatformDb } from "../../db/index.js";
import { poolConfig } from "../../db/schema/pool-config.js";
import { poolInstances } from "../../db/schema/pool-instances.js";

export type PoolInstanceStatus = "warm" | "claimed" | "dead";

export interface PoolInstance {
  id: string;
  containerId: string;
  status: PoolInstanceStatus;
  /** Partition key (e.g., product slug). Opaque to the pool. */
  partition: string | null;
  image: string | null;
  /** Node this container lives on. */
  nodeId: string;
}

export interface IPoolRepository {
  getPoolSize(productSlug?: string): Promise<number>;
  setPoolSize(size: number, productSlug?: string): Promise<void>;
  warmCount(productSlug?: string): Promise<number>;
  /** Warm counts grouped by node for a product. */
  warmCountByNode(productSlug: string): Promise<Map<string, number>>;
  insertWarm(id: string, containerId: string, nodeId: string, productSlug: string, image: string): Promise<void>;
  /** All non-dead instances (warm + claimed). Every row returned MUST have a live container. */
  listActive(productSlug?: string): Promise<PoolInstance[]>;
  markDead(id: string): Promise<void>;
  deleteDead(): Promise<void>;
  /** Atomically claim the oldest warm instance, optionally on a specific node. */
  claim(partition: string, nodeId?: string): Promise<{ id: string; containerId: string; nodeId: string } | null>;
  updateInstanceStatus(id: string, status: PoolInstanceStatus): Promise<void>;
}

export class DrizzlePoolRepository implements IPoolRepository {
  constructor(private db: PlatformDb) {}

  async getPoolSize(productSlug?: string): Promise<number> {
    try {
      const slug = productSlug ?? "__default__";
      const rows = await this.db
        .select({ poolSize: poolConfig.poolSize })
        .from(poolConfig)
        .where(eq(poolConfig.productSlug, slug));
      if (rows.length > 0) return rows[0].poolSize;

      // Fall back to legacy id=1 row for backwards compat
      const legacy = await this.db
        .select({ poolSize: poolConfig.poolSize })
        .from(poolConfig)
        .where(eq(poolConfig.id, 1));
      return legacy[0]?.poolSize ?? 2;
    } catch {
      return 2;
    }
  }

  async setPoolSize(size: number, productSlug?: string): Promise<void> {
    const slug = productSlug ?? "__default__";
    await this.db
      .insert(poolConfig)
      .values({ poolSize: size, productSlug: slug })
      .onConflictDoUpdate({
        target: poolConfig.productSlug,
        set: { poolSize: size },
      });
  }

  async warmCount(productSlug?: string): Promise<number> {
    const conditions = [eq(poolInstances.status, "warm")];
    if (productSlug) {
      conditions.push(eq(poolInstances.productSlug, productSlug));
    }
    const rows = await this.db
      .select({ count: count() })
      .from(poolInstances)
      .where(and(...conditions));
    return rows[0]?.count ?? 0;
  }

  async warmCountByNode(productSlug: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ nodeId: poolInstances.nodeId, count: count() })
      .from(poolInstances)
      .where(and(eq(poolInstances.status, "warm"), eq(poolInstances.productSlug, productSlug)))
      .groupBy(poolInstances.nodeId);
    const result = new Map<string, number>();
    for (const r of rows) {
      result.set(r.nodeId, r.count);
    }
    return result;
  }

  async insertWarm(id: string, containerId: string, nodeId: string, productSlug: string, image: string): Promise<void> {
    await this.db.insert(poolInstances).values({
      id,
      containerId,
      status: "warm",
      nodeId,
      productSlug,
      image,
    });
  }

  async listActive(productSlug?: string): Promise<PoolInstance[]> {
    const conditions = [inArray(poolInstances.status, ["warm", "claimed"])];
    if (productSlug) {
      conditions.push(eq(poolInstances.productSlug, productSlug));
    }
    const rows = await this.db
      .select({
        id: poolInstances.id,
        containerId: poolInstances.containerId,
        status: poolInstances.status,
        productSlug: poolInstances.productSlug,
        image: poolInstances.image,
        nodeId: poolInstances.nodeId,
      })
      .from(poolInstances)
      .where(and(...conditions));
    return rows.map((r) => ({
      id: r.id,
      containerId: r.containerId,
      status: r.status as PoolInstanceStatus,
      partition: r.productSlug ?? null,
      image: r.image ?? null,
      nodeId: r.nodeId,
    }));
  }

  async markDead(id: string): Promise<void> {
    await this.db.update(poolInstances).set({ status: "dead" }).where(eq(poolInstances.id, id));
  }

  async deleteDead(): Promise<void> {
    await this.db.delete(poolInstances).where(eq(poolInstances.status, "dead"));
  }

  async claim(partition: string, nodeId?: string): Promise<{ id: string; containerId: string; nodeId: string } | null> {
    // Atomic claim inside a transaction: select oldest warm + lock, then update.
    // Returns the row's nodeId so the caller can enqueue a pinned rename
    // operation at the agent that hosts the warm container.
    return this.db.transaction(async (tx) => {
      const conditions = [eq(poolInstances.status, "warm"), eq(poolInstances.productSlug, partition)];
      if (nodeId) {
        conditions.push(eq(poolInstances.nodeId, nodeId));
      }
      const [candidate] = await tx
        .select({ id: poolInstances.id, containerId: poolInstances.containerId, nodeId: poolInstances.nodeId })
        .from(poolInstances)
        .where(and(...conditions))
        .orderBy(asc(poolInstances.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });

      if (!candidate) return null;

      await tx
        .update(poolInstances)
        .set({ status: "claimed", claimedAt: new Date() })
        .where(eq(poolInstances.id, candidate.id));

      return { id: candidate.id, containerId: candidate.containerId, nodeId: candidate.nodeId };
    });
  }

  async updateInstanceStatus(id: string, status: PoolInstanceStatus): Promise<void> {
    await this.db.update(poolInstances).set({ status }).where(eq(poolInstances.id, id));
  }
}
