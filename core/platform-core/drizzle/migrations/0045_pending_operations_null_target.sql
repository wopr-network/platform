-- Phase 3 null-target refactor: relax the agent RLS policy to allow
-- target-null rows through.
--
-- Creation-class operations (bot.start, pool.warm) are enqueued with
-- target = NULL so any agent can claim them. The winning agent's handler
-- stamps its own nodeId into the result payload; the caller reads that
-- nodeId and persists it (e.g., to bot_instances.node_id). After creation,
-- subsequent lifecycle ops (bot.stop, bot.logs, etc.) route via target =
-- <nodeId> as before — the container's home is pinned from the moment it's
-- created.
--
-- The existing policy was `target = current_setting('agent.node_id', true)`
-- which evaluates to NULL when either side is null, so null-target rows
-- were invisible to agents. The new predicate explicitly allows them.
--
-- See docs/2026-04-08-db-queue-architecture.md — the refactor collapses
-- the composite Fleet + per-node FleetManager leaves into a single Fleet
-- class that enqueues null-target for create and pinned-target for lifecycle.
DROP POLICY IF EXISTS "pending_ops_agent_target" ON "pending_operations";
--> statement-breakpoint

CREATE POLICY "pending_ops_agent_target"
  ON "pending_operations"
  AS PERMISSIVE
  FOR ALL
  TO "agent_role"
  USING ("target" IS NULL OR "target" = current_setting('agent.node_id', true))
  WITH CHECK ("target" IS NULL OR "target" = current_setting('agent.node_id', true));
