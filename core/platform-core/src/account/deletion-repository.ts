import { and, count, desc, eq, lte, sql } from "drizzle-orm";
import type { PlatformDb } from "../db/index.js";
import { accountDeletionRequests } from "../db/schema/index.js";
import type { DeletionRequestRow, DeletionStatus, InsertDeletionRequest } from "./repository-types.js";

export type { DeletionRequestRow, InsertDeletionRequest };

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IDeletionRepository {
  insert(data: InsertDeletionRequest): Promise<void>;
  getById(id: string): Promise<DeletionRequestRow | null>;
  listByTenant(tenantId: string): Promise<DeletionRequestRow[]>;
  getPendingForTenant(tenantId: string): Promise<DeletionRequestRow | null>;
  cancel(id: string, cancelReason: string): Promise<boolean>;
  markCompleted(id: string, summary: string): Promise<void>;
  findExpired(): Promise<DeletionRequestRow[]>;
  list(opts: {
    status?: DeletionStatus;
    limit: number;
    offset: number;
  }): Promise<{ requests: DeletionRequestRow[]; total: number }>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleDeletionRepository implements IDeletionRepository {
  constructor(private readonly db: PlatformDb) {}

  async insert(data: InsertDeletionRequest): Promise<void> {
    const deleteAfter =
      data.deleteAfter ?? new Date(Date.now() + (data.graceDays ?? 30) * 24 * 60 * 60 * 1000).toISOString();
    await this.db.insert(accountDeletionRequests).values({
      id: data.id,
      tenantId: data.tenantId,
      requestedBy: data.requestedBy,
      deleteAfter,
      reason: data.reason ?? null,
    });
  }

  async getById(id: string): Promise<DeletionRequestRow | null> {
    const rows = await this.db.select().from(accountDeletionRequests).where(eq(accountDeletionRequests.id, id));
    const row = rows[0];
    return row ? toRow(row) : null;
  }

  async listByTenant(tenantId: string): Promise<DeletionRequestRow[]> {
    const rows = await this.db
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.tenantId, tenantId));
    return rows.map(toRow);
  }

  async getPendingForTenant(tenantId: string): Promise<DeletionRequestRow | null> {
    const rows = await this.db
      .select()
      .from(accountDeletionRequests)
      .where(and(eq(accountDeletionRequests.tenantId, tenantId), eq(accountDeletionRequests.status, "pending")))
      .limit(1);
    const row = rows[0];
    return row ? toRow(row) : null;
  }

  async cancel(id: string, cancelReason: string): Promise<boolean> {
    const result = await this.db
      .update(accountDeletionRequests)
      .set({
        status: "cancelled",
        cancelReason,
        updatedAt: sql`now()`,
      })
      .where(and(eq(accountDeletionRequests.id, id), eq(accountDeletionRequests.status, "pending")))
      .returning({ id: accountDeletionRequests.id });
    return result.length > 0;
  }

  async markCompleted(id: string, summary: string): Promise<void> {
    await this.db
      .update(accountDeletionRequests)
      .set({
        status: "completed",
        completedAt: sql`now()::text`,
        deletionSummary: summary,
        updatedAt: sql`now()`,
      })
      .where(and(eq(accountDeletionRequests.id, id), eq(accountDeletionRequests.status, "pending")));
  }

  async findExpired(): Promise<DeletionRequestRow[]> {
    const rows = await this.db
      .select()
      .from(accountDeletionRequests)
      .where(
        and(eq(accountDeletionRequests.status, "pending"), lte(accountDeletionRequests.deleteAfter, sql`now()::text`)),
      );
    return rows.map(toRow);
  }

  async list(opts: {
    status?: DeletionStatus;
    limit: number;
    offset: number;
  }): Promise<{ requests: DeletionRequestRow[]; total: number }> {
    const conditions = opts.status ? eq(accountDeletionRequests.status, opts.status) : undefined;

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(accountDeletionRequests)
        .where(conditions)
        .orderBy(desc(accountDeletionRequests.createdAt))
        .limit(opts.limit)
        .offset(opts.offset),
      this.db.select({ count: count() }).from(accountDeletionRequests).where(conditions),
    ]);

    return {
      requests: rows.map(toRow),
      total: totalResult[0]?.count ?? 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

export function toRow(row: typeof accountDeletionRequests.$inferSelect): DeletionRequestRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    requestedBy: row.requestedBy,
    status: row.status as DeletionRequestRow["status"],
    deleteAfter: row.deleteAfter,
    reason: row.reason,
    cancelReason: row.cancelReason,
    completedAt: row.completedAt,
    deletionSummary: row.deletionSummary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
