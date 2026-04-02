/**
 * LeaderElection — DB-based leader lease for singleton background services.
 *
 * One platform-core instance holds the lease at a time. The leader heartbeats
 * every 5s. If a leader misses 3 beats (15s TTL), any standby may claim it.
 *
 * Usage:
 *   const election = new LeaderElection(db);
 *   election.start();                 // begins campaigning
 *   election.onPromoted(startJobs);   // called when this instance becomes leader
 *   election.onDemoted(stopJobs);     // called when this instance loses leadership
 *   election.stop();                  // stop campaigning, release lease
 */

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { logger } from "../config/logger.js";
import type { DrizzleDb } from "../db/index.js";
import { leaderLease } from "../db/schema/leader-lease.js";

const LEASE_KEY = "core-leader";
const HEARTBEAT_INTERVAL_S = 5;
const LEASE_TTL_S = 15;

export class LeaderElection {
  readonly instanceId = randomUUID();
  private _isLeader = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private promotedCb: (() => void | Promise<void>) | null = null;
  private demotedCb: (() => void | Promise<void>) | null = null;

  constructor(private readonly db: DrizzleDb) {}

  /** Whether this instance currently holds the leader lease. */
  get isLeader(): boolean {
    return this._isLeader;
  }

  /** Register callback for when this instance becomes leader. */
  onPromoted(cb: () => void | Promise<void>): void {
    this.promotedCb = cb;
  }

  /** Register callback for when this instance loses leadership. */
  onDemoted(cb: () => void | Promise<void>): void {
    this.demotedCb = cb;
  }

  /** Start the election loop. */
  start(): void {
    if (this.timer) return;
    // Run immediately, then on interval
    void this.tick();
    this.timer = setInterval(() => void this.tick(), HEARTBEAT_INTERVAL_S * 1000);
    logger.info("Leader election started", { instanceId: this.instanceId });
  }

  /** Stop campaigning and release the lease if held. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this._isLeader) {
      // Release the lease so standby can take over immediately
      try {
        await this.db.delete(leaderLease).where(eq(leaderLease.holderId, this.instanceId));
      } catch {
        // Best-effort release
      }
      this._isLeader = false;
      logger.info("Leader lease released", { instanceId: this.instanceId });
    }
  }

  private async tick(): Promise<void> {
    try {
      if (this._isLeader) {
        await this.heartbeat();
      } else {
        await this.tryAcquire();
      }
    } catch (err) {
      logger.warn("Leader election tick failed", { error: String(err), instanceId: this.instanceId });
      // If we thought we were leader but can't heartbeat, demote
      if (this._isLeader) {
        this._isLeader = false;
        logger.warn("Demoted (heartbeat failed)", { instanceId: this.instanceId });
        this.demotedCb?.();
      }
    }
  }

  /** Leader heartbeat — update our timestamp. */
  private async heartbeat(): Promise<void> {
    const now = epochS();
    const result = await this.db
      .update(leaderLease)
      .set({ heartbeatAt: now })
      .where(eq(leaderLease.holderId, this.instanceId));

    // If our row disappeared (someone deleted it), we lost leadership
    if ((result as { rowCount?: number }).rowCount === 0) {
      this._isLeader = false;
      logger.warn("Demoted (lease row missing)", { instanceId: this.instanceId });
      this.demotedCb?.();
    }
  }

  /** Standby attempt — try to insert or claim an expired lease. */
  private async tryAcquire(): Promise<void> {
    const now = epochS();
    const expiry = now - LEASE_TTL_S;

    // Try upsert: insert if no row exists, or claim if heartbeat expired
    const result = await this.db.execute(sql`
      INSERT INTO leader_lease (id, holder_id, heartbeat_at)
      VALUES (${LEASE_KEY}, ${this.instanceId}, ${now})
      ON CONFLICT (id) DO UPDATE
        SET holder_id = ${this.instanceId}, heartbeat_at = ${now}
        WHERE leader_lease.heartbeat_at < ${expiry}
    `);

    const claimed = ((result as { rowCount?: number }).rowCount ?? 0) > 0;
    if (claimed) {
      this._isLeader = true;
      logger.info("Promoted to leader", { instanceId: this.instanceId });
      this.promotedCb?.();
    }
  }
}

function epochS(): number {
  return Math.floor(Date.now() / 1000);
}
