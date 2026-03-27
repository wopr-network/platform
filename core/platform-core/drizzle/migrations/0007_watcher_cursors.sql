CREATE TABLE IF NOT EXISTS "watcher_cursors" (
  "watcher_id" text PRIMARY KEY NOT NULL,
  "cursor_block" integer NOT NULL,
  "updated_at" text DEFAULT (now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watcher_processed" (
  "watcher_id" text NOT NULL,
  "tx_id" text NOT NULL,
  "processed_at" text DEFAULT (now()) NOT NULL,
  CONSTRAINT "watcher_processed_watcher_id_tx_id_pk" PRIMARY KEY ("watcher_id", "tx_id")
);
