/**
 * LeaderLeaseRepository — Drizzle-backed leader lease persistence.
 *
 * Pure Drizzle, no raw SQL. Schema is the single source of truth.
 */

import { eq, lt } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { leaderLease } from "../db/schema/leader-lease.js";

export interface ILeaderLeaseRepository {
  /** Heartbeat — update timestamp for current holder. Returns true if row existed. */
  heartbeat(holderId: string, now: number): Promise<boolean>;
  /** Try to acquire — insert or claim expired lease. Returns true if acquired. */
  tryAcquire(holderId: string, now: number, ttlSeconds: number): Promise<boolean>;
  /** Release — delete lease held by this instance. */
  release(holderId: string): Promise<void>;
}

export class DrizzleLeaderLeaseRepository implements ILeaderLeaseRepository {
  constructor(private readonly db: DrizzleDb) {}

  async heartbeat(holderId: string, now: number): Promise<boolean> {
    const result = await this.db
      .update(leaderLease)
      .set({ heartbeatAt: now })
      .where(eq(leaderLease.holderId, holderId));
    return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
  }

  async tryAcquire(holderId: string, now: number, ttlSeconds: number): Promise<boolean> {
    const expiry = now - ttlSeconds;
    const result = await this.db
      .insert(leaderLease)
      .values({ id: "core-leader", holderId, heartbeatAt: now })
      .onConflictDoUpdate({
        target: leaderLease.id,
        set: { holderId, heartbeatAt: now },
        setWhere: lt(leaderLease.heartbeatAt, expiry),
      });
    return ((result as { rowCount?: number }).rowCount ?? 0) > 0;
  }

  async release(holderId: string): Promise<void> {
    await this.db.delete(leaderLease).where(eq(leaderLease.holderId, holderId));
  }
}
