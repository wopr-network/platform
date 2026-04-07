/**
 * LeaderElection — DB-based leader lease for singleton background services.
 *
 * One platform-core instance holds the lease at a time. The leader heartbeats
 * every 5s. If a leader misses 3 beats (15s TTL), any standby may claim it.
 *
 * Usage:
 *   const repo = new DrizzleLeaderLeaseRepository(db);
 *   const election = new LeaderElection(repo);
 *   election.start();                 // begins campaigning
 *   election.onPromoted(startJobs);   // called when this instance becomes leader
 *   election.onDemoted(stopJobs);     // called when this instance loses leadership
 *   election.stop();                  // stop campaigning, release lease
 */

import { randomUUID } from "node:crypto";
import { logger } from "../config/logger.js";
import type { ILeaderLeaseRepository } from "./leader-lease-repository.js";

const HEARTBEAT_INTERVAL_S = 5;
const LEASE_TTL_S = 15;

export class LeaderElection {
  readonly instanceId = randomUUID();
  private _isLeader = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private promotedCb: (() => void | Promise<void>) | null = null;
  private demotedCb: (() => void | Promise<void>) | null = null;

  constructor(private readonly repo: ILeaderLeaseRepository) {}

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
      try {
        await this.repo.release(this.instanceId);
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
      if (this._isLeader) {
        this._isLeader = false;
        logger.warn("Demoted (heartbeat failed)", { instanceId: this.instanceId });
        this.demotedCb?.();
      }
    }
  }

  private async heartbeat(): Promise<void> {
    const updated = await this.repo.heartbeat(this.instanceId, epochS());
    if (!updated) {
      this._isLeader = false;
      logger.warn("Demoted (lease row missing)", { instanceId: this.instanceId });
      this.demotedCb?.();
    }
  }

  private async tryAcquire(): Promise<void> {
    const claimed = await this.repo.tryAcquire(this.instanceId, epochS(), LEASE_TTL_S);
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
