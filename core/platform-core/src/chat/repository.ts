import { randomUUID } from "node:crypto";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { chatMessages } from "../db/schema/chat-messages.js";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  instanceId: string;
  userId: string | null;
  role: ChatRole;
  content: string;
  sequence: number;
  createdAt: Date;
}

export interface AppendInput {
  instanceId: string;
  userId: string | null;
  role: ChatRole;
  content: string;
}

/**
 * Per-instance chat history repository. Writes are append-only; the
 * sequence column is derived from the current max(sequence) for the
 * instance plus one. The unique (instance_id, sequence) index in the
 * migration catches race-condition inserts — concurrent appends to the
 * same instance will have one of the transactions fail on the unique
 * constraint and the caller should retry.
 */
export interface IChatMessageRepository {
  /** Append a message to an instance's transcript. Returns the persisted row. */
  append(input: AppendInput): Promise<ChatMessage>;
  /** List all messages for an instance, oldest first. Used for history replay on UI reconnect. */
  listByInstance(instanceId: string): Promise<ChatMessage[]>;
  /** Count messages for an instance — primarily for tests + observability. */
  countByInstance(instanceId: string): Promise<number>;
}

export class DrizzleChatMessageRepository implements IChatMessageRepository {
  constructor(private readonly db: DrizzleDb) {}

  async append(input: AppendInput): Promise<ChatMessage> {
    // Derive next sequence from the current max. A unique index on
    // (instance_id, sequence) enforces gap-freeness under contention;
    // concurrent writers will see one transaction fail and must retry.
    const [last] = await this.db
      .select({ sequence: chatMessages.sequence })
      .from(chatMessages)
      .where(eq(chatMessages.instanceId, input.instanceId))
      .orderBy(desc(chatMessages.sequence))
      .limit(1);
    const nextSequence = (last?.sequence ?? 0) + 1;

    const id = randomUUID();
    const [row] = await this.db
      .insert(chatMessages)
      .values({
        id,
        instanceId: input.instanceId,
        userId: input.userId,
        role: input.role,
        content: input.content,
        sequence: nextSequence,
      })
      .returning();
    return this.map(row);
  }

  async listByInstance(instanceId: string): Promise<ChatMessage[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.instanceId, instanceId))
      .orderBy(asc(chatMessages.sequence));
    return rows.map((r) => this.map(r));
  }

  async countByInstance(instanceId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(eq(chatMessages.instanceId, instanceId));
    return row?.count ?? 0;
  }

  private map(row: typeof chatMessages.$inferSelect): ChatMessage {
    return {
      id: row.id,
      instanceId: row.instanceId,
      userId: row.userId,
      role: row.role as ChatRole,
      content: row.content,
      sequence: row.sequence,
      createdAt: row.createdAt,
    };
  }
}
