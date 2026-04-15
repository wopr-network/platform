import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { botInstances } from "./bot-instances.js";

/**
 * Per-instance chat history. Core proxies SSE between the UI and the
 * instance's sidecar and persists every user turn + completed assistant
 * turn here so a UI reconnect can replay the full transcript.
 *
 * See migration 0050_chat_messages.sql for the indexes and the rationale
 * behind the sequence column (monotonic per instance, enforces gap-free
 * ordering without timestamp tie-breakers).
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => botInstances.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    role: text("role").notNull().$type<"user" | "assistant" | "system">(),
    content: text("content").notNull(),
    sequence: bigint("sequence", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chat_messages_instance_sequence_idx").on(t.instanceId, t.sequence),
    index("chat_messages_instance_created_idx").on(t.instanceId, t.createdAt),
  ],
);
