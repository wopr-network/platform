import { bigint, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Leader lease — single-row table for leader election among platform-core instances.
 *
 * Only one instance holds the lease at a time. The leader writes heartbeats
 * every `HEARTBEAT_INTERVAL_MS`. If `heartbeat_at` falls behind by more than
 * `LEASE_TTL_MS`, any standby instance may claim the lease.
 */
export const leaderLease = pgTable("leader_lease", {
  /** Singleton row key — always "core-leader". */
  id: text("id").primaryKey(),
  /** UUID of the instance currently holding the lease (set at boot). */
  holderId: text("holder_id").notNull(),
  /** Unix epoch seconds of the last heartbeat from the leader. */
  heartbeatAt: bigint("heartbeat_at", { mode: "number" }).notNull(),
});
