import { and, eq, like, lte, or, sql } from "drizzle-orm";
import type { PlatformDb } from "../db/index.js";
import {
  accountDeletionRequests,
  adminAuditLog,
  adminNotes,
  auditLog,
  backupStatus,
  billingPeriodSummaries,
  botInstances,
  creditBalances,
  creditTransactions,
  cryptoCharges,
  emailNotifications,
  meterEvents,
  notificationPreferences,
  notificationQueue,
  snapshots,
  stripeUsageReports,
  tenantCustomers,
  tenantStatus,
  usageSummaries,
  userRoles,
} from "../db/schema/index.js";
import { toRow } from "./deletion-repository.js";
import type { DeletionRequestRow } from "./repository-types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface IDeletionExecutorRepository {
  /** Find all pending requests whose deleteAfter is <= now. */
  findRipe(now: string): Promise<DeletionRequestRow[]>;
  /** Mark a request as completed with a deletion summary. */
  markCompleted(id: string, deletionSummary: string): Promise<boolean>;
  /** Find the active (pending) deletion request for a tenant, if any. */
  findPendingByTenant(tenantId: string): Promise<DeletionRequestRow | null>;

  // --- Data deletion methods (GDPR purge) ---
  deleteBotInstances(tenantId: string): Promise<number>;
  deleteCreditTransactions(tenantId: string): Promise<number>;
  deleteCreditBalances(tenantId: string): Promise<number>;
  deleteCreditAdjustments(tenantId: string): Promise<number | null>;
  deleteMeterEvents(tenantId: string): Promise<number>;
  deleteUsageSummaries(tenantId: string): Promise<number>;
  deleteBillingPeriodSummaries(tenantId: string): Promise<number>;
  deleteStripeUsageReports(tenantId: string): Promise<number>;
  deleteNotificationQueue(tenantId: string): Promise<number>;
  deleteNotificationPreferences(tenantId: string): Promise<number>;
  deleteEmailNotifications(tenantId: string): Promise<number>;
  deleteAuditLog(tenantId: string): Promise<number>;
  anonymizeAuditLog(tenantId: string): Promise<number>;
  deleteAdminNotes(tenantId: string): Promise<number>;
  listSnapshotS3Keys(tenantId: string): Promise<{ id: string; s3Key: string | null }[]>;
  deleteSnapshots(tenantId: string): Promise<number>;
  deleteBackupStatus(tenantId: string): Promise<number>;
  deleteCryptoCharges(tenantId: string): Promise<number>;
  deleteTenantStatus(tenantId: string): Promise<number>;
  deleteUserRolesByUser(tenantId: string): Promise<number>;
  deleteUserRolesByTenant(tenantId: string): Promise<number>;
  deleteTenantCustomers(tenantId: string): Promise<number>;
  deleteAuthUser(tenantId: string): Promise<{
    sessionChanges: number;
    accountChanges: number;
    verificationChanges: number;
    userChanges: number;
  }>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DrizzleDeletionExecutorRepository implements IDeletionExecutorRepository {
  constructor(
    private readonly db: PlatformDb,
    private readonly authDb?: {
      query: (sql: string, params?: unknown[]) => Promise<{ affectedRows?: number; rowCount?: number }>;
    },
  ) {}

  async findRipe(now: string): Promise<DeletionRequestRow[]> {
    const rows = await this.db
      .select()
      .from(accountDeletionRequests)
      .where(and(eq(accountDeletionRequests.status, "pending"), lte(accountDeletionRequests.deleteAfter, now)));
    return rows.map(toRow);
  }

  async markCompleted(id: string, deletionSummary: string): Promise<boolean> {
    const result = await this.db
      .update(accountDeletionRequests)
      .set({
        status: "completed",
        completedAt: sql`now()::text`,
        deletionSummary,
        updatedAt: sql`now()`,
      })
      .where(and(eq(accountDeletionRequests.id, id), eq(accountDeletionRequests.status, "pending")))
      .returning({ id: accountDeletionRequests.id });
    return result.length > 0;
  }

  async findPendingByTenant(tenantId: string): Promise<DeletionRequestRow | null> {
    const rows = await this.db
      .select()
      .from(accountDeletionRequests)
      .where(and(eq(accountDeletionRequests.tenantId, tenantId), eq(accountDeletionRequests.status, "pending")))
      .limit(1);
    const row = rows[0];
    return row ? toRow(row) : null;
  }

  // --- Data deletion methods ---

  async deleteBotInstances(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(botInstances)
      .where(eq(botInstances.tenantId, tenantId))
      .returning({ id: botInstances.id });
    return result.length;
  }

  async deleteCreditTransactions(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(creditTransactions)
      .where(eq(creditTransactions.tenantId, tenantId))
      .returning({ id: creditTransactions.id });
    return result.length;
  }

  async deleteCreditBalances(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(creditBalances)
      .where(eq(creditBalances.tenantId, tenantId))
      .returning({ tenantId: creditBalances.tenantId });
    return result.length;
  }

  async deleteCreditAdjustments(tenantId: string): Promise<number | null> {
    // raw SQL: credit_adjustments is not in the Drizzle schema (optional table)
    try {
      const result = await this.db.execute(sql`DELETE FROM credit_adjustments WHERE tenant_id = ${tenantId}`);
      return (result as unknown as { rowCount?: number }).rowCount ?? 0;
    } catch (err: unknown) {
      // Drizzle may wrap PGlite errors; check both top-level and cause for the PG code
      const errObj = err as { code?: string; cause?: { code?: string }; message?: string };
      const pgCode = errObj.code ?? errObj.cause?.code;
      if (pgCode === "42P01") return null; // table does not exist
      // PGlite errors surfaced through Drizzle may embed the code in the message
      if (errObj.message?.includes("42P01")) return null;
      throw err;
    }
  }

  async deleteMeterEvents(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(meterEvents)
      .where(eq(meterEvents.tenant, tenantId))
      .returning({ id: meterEvents.id });
    return result.length;
  }

  async deleteUsageSummaries(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(usageSummaries)
      .where(eq(usageSummaries.tenant, tenantId))
      .returning({ id: usageSummaries.id });
    return result.length;
  }

  async deleteBillingPeriodSummaries(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(billingPeriodSummaries)
      .where(eq(billingPeriodSummaries.tenant, tenantId))
      .returning({ id: billingPeriodSummaries.id });
    return result.length;
  }

  async deleteStripeUsageReports(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(stripeUsageReports)
      .where(eq(stripeUsageReports.tenant, tenantId))
      .returning({ id: stripeUsageReports.id });
    return result.length;
  }

  async deleteNotificationQueue(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(notificationQueue)
      .where(eq(notificationQueue.tenantId, tenantId))
      .returning({ id: notificationQueue.id });
    return result.length;
  }

  async deleteNotificationPreferences(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(notificationPreferences)
      .where(eq(notificationPreferences.tenantId, tenantId))
      .returning({ tenantId: notificationPreferences.tenantId });
    return result.length;
  }

  async deleteEmailNotifications(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(emailNotifications)
      .where(eq(emailNotifications.tenantId, tenantId))
      .returning({ id: emailNotifications.id });
    return result.length;
  }

  async deleteAuditLog(tenantId: string): Promise<number> {
    const result = await this.db.delete(auditLog).where(eq(auditLog.userId, tenantId)).returning({ id: auditLog.id });
    return result.length;
  }

  async anonymizeAuditLog(tenantId: string): Promise<number> {
    const result = await this.db
      .update(adminAuditLog)
      .set({ targetTenant: "[deleted]", targetUser: "[deleted]" })
      .where(or(eq(adminAuditLog.targetTenant, tenantId), eq(adminAuditLog.targetUser, tenantId)))
      .returning({ id: adminAuditLog.id });
    return result.length;
  }

  async deleteAdminNotes(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(adminNotes)
      .where(eq(adminNotes.tenantId, tenantId))
      .returning({ id: adminNotes.id });
    return result.length;
  }

  async listSnapshotS3Keys(tenantId: string): Promise<{ id: string; s3Key: string | null }[]> {
    const rows = await this.db
      .select({ id: snapshots.id, s3Key: snapshots.s3Key })
      .from(snapshots)
      .where(eq(snapshots.tenant, tenantId));
    return rows;
  }

  async deleteSnapshots(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(snapshots)
      .where(eq(snapshots.tenant, tenantId))
      .returning({ id: snapshots.id });
    return result.length;
  }

  async deleteBackupStatus(tenantId: string): Promise<number> {
    // Escape LIKE wildcards in tenantId to prevent injection
    const safeTenantId = tenantId.replace(/%/g, "\\%").replace(/_/g, "\\_");
    // backup_status uses containerId with pattern "tenant_{id}_..."
    const result = await this.db
      .delete(backupStatus)
      .where(like(backupStatus.containerId, `tenant_${safeTenantId}%`))
      .returning({ containerId: backupStatus.containerId });
    return result.length;
  }

  async deleteCryptoCharges(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(cryptoCharges)
      .where(eq(cryptoCharges.tenantId, tenantId))
      .returning({ referenceId: cryptoCharges.referenceId });
    return result.length;
  }

  async deleteTenantStatus(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(tenantStatus)
      .where(eq(tenantStatus.tenantId, tenantId))
      .returning({ tenantId: tenantStatus.tenantId });
    return result.length;
  }

  async deleteUserRolesByUser(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(userRoles)
      .where(eq(userRoles.userId, tenantId))
      .returning({ userId: userRoles.userId });
    return result.length;
  }

  async deleteUserRolesByTenant(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(userRoles)
      .where(eq(userRoles.tenantId, tenantId))
      .returning({ userId: userRoles.userId });
    return result.length;
  }

  async deleteTenantCustomers(tenantId: string): Promise<number> {
    const result = await this.db
      .delete(tenantCustomers)
      .where(eq(tenantCustomers.tenant, tenantId))
      .returning({ tenant: tenantCustomers.tenant });
    return result.length;
  }

  async deleteAuthUser(tenantId: string): Promise<{
    sessionChanges: number;
    accountChanges: number;
    verificationChanges: number;
    userChanges: number;
  }> {
    if (!this.authDb) {
      return { sessionChanges: 0, accountChanges: 0, verificationChanges: 0, userChanges: 0 };
    }

    const getCount = (result: { affectedRows?: number; rowCount?: number }): number =>
      result.affectedRows ?? result.rowCount ?? 0;

    // raw SQL: better-auth tables are not in the Drizzle schema
    // Wrapped in a transaction — all four DELETEs must succeed or none.
    await this.authDb.query("BEGIN", []);
    try {
      const sessionResult = await this.authDb.query(`DELETE FROM session WHERE user_id = $1`, [tenantId]);
      const accountResult = await this.authDb.query(`DELETE FROM account WHERE user_id = $1`, [tenantId]);
      const verificationResult = await this.authDb.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [
        tenantId,
      ]);
      const userResult = await this.authDb.query(`DELETE FROM "user" WHERE id = $1`, [tenantId]);
      await this.authDb.query("COMMIT", []);

      return {
        sessionChanges: getCount(sessionResult),
        accountChanges: getCount(accountResult),
        verificationChanges: getCount(verificationResult),
        userChanges: getCount(userResult),
      };
    } catch (err) {
      await this.authDb.query("ROLLBACK", []);
      throw err;
    }
  }
}
