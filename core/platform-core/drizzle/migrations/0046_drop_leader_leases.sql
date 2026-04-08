-- Drop leader_leases — the leader election subsystem is gone.
--
-- Periodic background maintenance (janitor sweep, queue purge, fleet
-- reconciliation, runtime billing) now runs via the PeriodicScheduler,
-- which fans out bucketed idempotency-key rows in pending_operations.
-- The unique partial index on `idempotency_key` collapses duplicate
-- inserts across replicas to exactly one row per bucket, so there's no
-- singleton to pin and no lease to heartbeat.
--
-- See `docs/2026-04-08-db-queue-architecture.md` §9 (idempotency-key
-- bucketing) and `src/queue/periodic-scheduler.ts`.

DROP TABLE IF EXISTS "leader_leases";
