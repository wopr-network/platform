-- DB-as-channel architecture: durable queue backing OperationQueue.
-- See docs/2026-04-08-db-queue-architecture.md §3.
CREATE TABLE IF NOT EXISTS "pending_operations" (
  "id" text PRIMARY KEY,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "target" text,
  "status" text NOT NULL DEFAULT 'pending',
  "result" jsonb,
  "error_message" text,
  "claimed_by" text,
  "claimed_at" text,
  "enqueued_at" text NOT NULL DEFAULT (now()),
  "completed_at" text,
  "idempotency_key" text,
  "timeout_s" integer NOT NULL DEFAULT 300
);
--> statement-breakpoint

-- Fast claim path: find pending rows filtered by target, ordered FIFO.
CREATE INDEX IF NOT EXISTS "idx_pending_ops_claim"
  ON "pending_operations" ("target", "enqueued_at")
  WHERE "status" = 'pending';
--> statement-breakpoint

-- Janitor path: find stuck processing rows past their timeout.
CREATE INDEX IF NOT EXISTS "idx_pending_ops_stuck"
  ON "pending_operations" ("claimed_at")
  WHERE "status" = 'processing';
--> statement-breakpoint

-- Idempotency: unique partial index so double-enqueue collides and the
-- second caller can piggy-back on the existing row.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_pending_ops_idempotency"
  ON "pending_operations" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
