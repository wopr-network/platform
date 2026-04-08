-- LISTEN/NOTIFY wiring for the DB-as-channel queue.
--
-- The trigger fires NOTIFY events from inside the database whenever a row
-- transitions into a state that a waiter cares about:
--
--   * INSERT → 'op_enqueued' with the row's target as payload
--     Workers LISTEN op_enqueued and wake their drain loop when a row lands
--     in a target they drain ('core' or their node id).
--
--   * UPDATE from 'processing' to 'succeeded' | 'failed' → 'op_complete'
--     with the row id as payload. The per-replica OperationQueue listener
--     wakes any in-flight execute() Promise waiting on that id.
--
-- Keeping the NOTIFY side in the database lets application code remain pure
-- Drizzle (no `db.execute(sql\`NOTIFY\`)` template literals in app logic).
-- See docs/2026-04-08-db-queue-architecture.md §4 + §11.2.
CREATE OR REPLACE FUNCTION pending_operations_notify() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_notify('op_enqueued', COALESCE(NEW.target, ''));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('succeeded', 'failed') AND OLD.status = 'processing' THEN
    PERFORM pg_notify('op_complete', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS pending_operations_notify_trg ON "pending_operations";
--> statement-breakpoint

CREATE TRIGGER pending_operations_notify_trg
  AFTER INSERT OR UPDATE ON "pending_operations"
  FOR EACH ROW EXECUTE FUNCTION pending_operations_notify();
