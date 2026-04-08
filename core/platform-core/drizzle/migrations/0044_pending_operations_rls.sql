-- Phase 2.3c: row-level security on pending_operations.
--
-- Establishes the security boundary for the agent-side queue worker.
-- Two roles + one policy + one shared login role (with no password
-- in this file — the boot-time bootstrap sets the real password from
-- a Vault secret).
--
-- ── Roles ────────────────────────────────────────────────────────────
--
-- `agent_role` — group role with NOLOGIN. Holds the SELECT/UPDATE
-- grants and is the target of the RLS policy. Per-node identification
-- happens at the SESSION level via the `agent.node_id` GUC, which the
-- AgentWorker sets on connect (`SET agent.node_id = '<my-node-id>'`).
--
-- `wopr_agent` — single shared login role agents authenticate as.
-- Inherits from `agent_role`. The password lives in Vault (key:
-- `agent_db_password`) and is set by `ensureAgentLoginRolePassword`
-- during core boot. We create the role with NULL password here so the
-- migration is committable to a public repo without leaking secrets.
-- Until the boot bootstrap runs, agents cannot log in.
--
-- ── Why a shared role + GUC instead of per-node credentials? ─────────
--
-- A fully-compromised agent process holds both the credential AND can
-- SET any session GUC, so per-node credentials don't add isolation
-- against that threat. They only add per-node revocation granularity,
-- which password rotation also gives you. Shared-role-plus-GUC is
-- strictly simpler with no security regression for the realistic
-- threat model (network-segmented internal Postgres + honest-but-
-- slightly-buggy agents).
--
-- Core continues to operate as the platform's existing connection
-- user. That user is the table owner, so RLS does NOT apply to its
-- queries — owners and superusers bypass RLS automatically. We
-- deliberately do NOT use FORCE ROW LEVEL SECURITY, which would
-- constrain the owner too. The policy targets `agent_role` only.
--
-- See docs/2026-04-08-db-queue-architecture.md §3 (security model).

-- The group role. NOLOGIN means it can only be membership'd into,
-- never used directly for authentication.
DO $$
BEGIN
  CREATE ROLE "agent_role" NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;
--> statement-breakpoint

-- The shared login role. Created without a password — bootstrap will
-- set one at boot. With NULL password the role exists but cannot
-- authenticate, which is exactly what we want until the bootstrap runs.
DO $$
BEGIN
  CREATE ROLE "wopr_agent" LOGIN PASSWORD NULL;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;
--> statement-breakpoint

-- Membership: wopr_agent inherits agent_role's permissions. Idempotent.
GRANT "agent_role" TO "wopr_agent";
--> statement-breakpoint

-- Per-node roles need SELECT to see their work and UPDATE to write the
-- terminal state. They must NOT be able to INSERT or DELETE — only the
-- core can enqueue or hard-delete operations.
GRANT SELECT, UPDATE ON "pending_operations" TO "agent_role";
--> statement-breakpoint

-- Enable RLS on the table. The table owner (core's connection user)
-- bypasses RLS automatically, so this is a no-op for core's queries.
ALTER TABLE "pending_operations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- The policy: an agent can only see and update rows whose target matches
-- the `agent.node_id` GUC it sets on connection. The GUC is set by
-- AgentWorker boot via `SET agent.node_id = '<id>'`. When the GUC is
-- unset, current_setting('agent.node_id', true) returns NULL, the
-- equality check is NULL, and the agent sees nothing — fail closed.
DROP POLICY IF EXISTS "pending_ops_agent_target" ON "pending_operations";
--> statement-breakpoint

CREATE POLICY "pending_ops_agent_target"
  ON "pending_operations"
  AS PERMISSIVE
  FOR ALL
  TO "agent_role"
  USING ("target" = current_setting('agent.node_id', true))
  WITH CHECK ("target" = current_setting('agent.node_id', true));
