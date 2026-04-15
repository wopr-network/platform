-- Per-instance chat history persistence. Core proxies SSE between the UI
-- and each bot instance's sidecar (OpenClaw gateway for Nemoclaw, similar
-- for other products). Every user turn and every completed assistant turn
-- is persisted here so a UI reconnect can replay the full transcript.
--
-- Keyed by instance_id (the bot_instances.id, which is the UUID used by
-- fleet APIs). user_id tracks who authored the message — important for
-- multi-user tenants where any org member can chat with an instance.
--
-- sequence is a monotonic per-instance counter so reads can be cheaply
-- ordered without tie-breaking on timestamps. The unique constraint
-- enforces no gaps/duplicates within an instance.
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY,
  "instance_id" uuid NOT NULL REFERENCES "bot_instances"("id") ON DELETE CASCADE,
  "user_id" text,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
  "content" text NOT NULL,
  "sequence" bigint NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_instance_sequence_idx"
  ON "chat_messages" ("instance_id", "sequence");

-- For history replay: oldest-first scan by instance.
CREATE INDEX IF NOT EXISTS "chat_messages_instance_created_idx"
  ON "chat_messages" ("instance_id", "created_at");
