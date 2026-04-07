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
}

export interface IPoolRepository {
  getPoolSize(productSlug?: string): Promise<number>;
  setPoolSize(size: number, productSlug?: string): Promise<void>;
  warmCount(productSlug?: string): Promise<number>;
  insertWarm(id: string, containerId: string, productSlug?: string, image?: string): Promise<void>;
  /** All non-dead instances (warm + claimed). Every row returned MUST have a live container. */
  listActive(productSlug?: string): Promise<PoolInstance[]>;
  markDead(id: string): Promise<void>;
  deleteDead(): Promise<void>;
  /** Atomically claim the oldest warm instance for a partition. */
  claim(partition?: string): Promise<{ id: string; containerId: string } | null>;
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

  async insertWarm(id: string, containerId: string, productSlug?: string, image?: string): Promise<void> {
    await this.db.insert(poolInstances).values({
      id,
      containerId,
      status: "warm",
      productSlug: productSlug ?? null,
      image: image ?? null,
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
      })
      .from(poolInstances)
      .where(and(...conditions));
    return rows.map((r) => ({
      id: r.id,
      containerId: r.containerId,
      status: r.status as PoolInstanceStatus,
      partition: r.productSlug ?? null,
      image: r.image ?? null,
    }));
  }

  async markDead(id: string): Promise<void> {
    await this.db.update(poolInstances).set({ status: "dead" }).where(eq(poolInstances.id, id));
  }

  async deleteDead(): Promise<void> {
    await this.db.delete(poolInstances).where(eq(poolInstances.status, "dead"));
  }

  async claim(partition?: string): Promise<{ id: string; containerId: string } | null> {
    // Atomic claim inside a transaction: select oldest warm + lock, then update.
    return this.db.transaction(async (tx) => {
      const conditions = [eq(poolInstances.status, "warm")];
      if (partition) {
        conditions.push(eq(poolInstances.productSlug, partition));
      }
      const [candidate] = await tx
        .select({ id: poolInstances.id, containerId: poolInstances.containerId })
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

      return { id: candidate.id, containerId: candidate.containerId };
    });
  }

  async updateInstanceStatus(id: string, status: PoolInstanceStatus): Promise<void> {
    await this.db.update(poolInstances).set({ status }).where(eq(poolInstances.id, id));
  }
}
