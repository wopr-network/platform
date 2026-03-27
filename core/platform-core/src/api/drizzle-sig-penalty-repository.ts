import { and, eq, lt, sql } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { webhookSigPenalties } from "../db/schema/index.js";
import type { SigPenalty } from "./repository-types.js";
import type { ISigPenaltyRepository } from "./sig-penalty-repository.js";

const MAX_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes

export class DrizzleSigPenaltyRepository implements ISigPenaltyRepository {
  constructor(private readonly db: DrizzleDb) {}

  async get(ip: string, source: string): Promise<SigPenalty | null> {
    const rows = await this.db
      .select()
      .from(webhookSigPenalties)
      .where(and(eq(webhookSigPenalties.ip, ip), eq(webhookSigPenalties.source, source)));
    return rows[0] ? this.toSigPenalty(rows[0]) : null;
  }

  async recordFailure(ip: string, source: string): Promise<SigPenalty> {
    const now = Date.now();

    const result = await this.db
      .insert(webhookSigPenalties)
      .values({ ip, source, failures: 1, blockedUntil: now + Math.min(1000 * 2 ** 1, MAX_BACKOFF_MS), updatedAt: now })
      .onConflictDoUpdate({
        target: [webhookSigPenalties.ip, webhookSigPenalties.source],
        set: {
          failures: sql`${webhookSigPenalties.failures} + 1`,
          blockedUntil: sql`${now} + LEAST(1000 * POWER(2, ${webhookSigPenalties.failures} + 1), ${MAX_BACKOFF_MS})`,
          updatedAt: sql`${now}`,
        },
      })
      .returning();

    const row = result[0];
    return {
      ip: row.ip,
      source: row.source,
      failures: row.failures,
      blockedUntil: row.blockedUntil,
      updatedAt: row.updatedAt,
    };
  }

  async clear(ip: string, source: string): Promise<void> {
    await this.db
      .delete(webhookSigPenalties)
      .where(and(eq(webhookSigPenalties.ip, ip), eq(webhookSigPenalties.source, source)));
  }

  async purgeStale(decayMs: number): Promise<number> {
    const cutoff = Date.now() - decayMs;
    const result = await this.db
      .delete(webhookSigPenalties)
      .where(lt(webhookSigPenalties.blockedUntil, cutoff))
      .returning({ ip: webhookSigPenalties.ip });
    return result.length;
  }

  private toSigPenalty(row: typeof webhookSigPenalties.$inferSelect): SigPenalty {
    return {
      ip: row.ip,
      source: row.source,
      failures: row.failures,
      blockedUntil: row.blockedUntil,
      updatedAt: row.updatedAt,
    };
  }
}
