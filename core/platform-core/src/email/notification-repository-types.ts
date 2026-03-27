// src/email/notification-repository-types.ts
//
// Plain TypeScript interfaces for email/notification domain objects.
// No Drizzle types. No better-sqlite3. These are the contracts
// the notification layer works against.

// ---------------------------------------------------------------------------
// Notification Queue (email layer — src/email/notification-queue-store.ts)
// ---------------------------------------------------------------------------

export type NotificationStatus = "pending" | "sent" | "failed";

/** Domain object for a queued notification in the email layer. */
export interface QueuedNotification {
  id: string;
  tenantId: string;
  template: string;
  data: string; // JSON-serialized payload
  status: NotificationStatus;
  attempts: number;
  retryAfter: number | null;
  sentAt: number | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Notification Preferences
// ---------------------------------------------------------------------------

/** Per-tenant notification preference flags. */
export interface NotificationPrefs {
  billing_low_balance: boolean;
  billing_receipts: boolean;
  billing_auto_topup: boolean;
  agent_channel_disconnect: boolean;
  agent_status_changes: boolean;
  account_role_changes: boolean;
  account_team_invites: boolean;
  fleet_updates: boolean;
}

// ---------------------------------------------------------------------------
// Admin Notification Queue (src/admin/notifications/store.ts)
// ---------------------------------------------------------------------------

export type NotificationEmailType =
  | "low_balance"
  | "grace_entered"
  | "suspended"
  | "receipt"
  | "welcome"
  | "reactivated";

export interface NotificationInput {
  tenantId: string;
  emailType: NotificationEmailType;
  recipientEmail: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface NotificationRow {
  id: string;
  tenantId: string;
  emailType: string;
  recipientEmail: string;
  payload: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  /** Unix epoch ms of last attempt */
  lastAttemptAt: number | null;
  lastError: string | null;
  /** Unix epoch ms for next retry. Null = immediately eligible. */
  retryAfter: number | null;
  /** Unix epoch ms */
  createdAt: number;
  /** Unix epoch ms */
  sentAt: number | null;
}

// ---------------------------------------------------------------------------
// Notification Template Types
// ---------------------------------------------------------------------------

/** Row shape returned by the template repository. */
export interface NotificationTemplateRow {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  htmlBody: string;
  textBody: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Repository contract for notification templates. */
export interface INotificationTemplateRepository {
  getByName(name: string): Promise<NotificationTemplateRow | null>;
  list(): Promise<NotificationTemplateRow[]>;
  upsert(
    name: string,
    template: Omit<NotificationTemplateRow, "id" | "name" | "createdAt" | "updatedAt">,
  ): Promise<void>;
  /**
   * Seed default templates — INSERT OR IGNORE so admin edits are not overwritten.
   * @returns number of templates inserted (not already present).
   */
  seed(
    templates: Array<{
      name: string;
      description: string;
      subject: string;
      htmlBody: string;
      textBody: string;
    }>,
  ): Promise<number>;
}

// ---------------------------------------------------------------------------
// Repository Interfaces
// ---------------------------------------------------------------------------

/** Repository interface for notification preferences. */
export interface INotificationPreferencesRepository {
  get(tenantId: string): Promise<NotificationPrefs>;
  update(tenantId: string, prefs: Partial<NotificationPrefs>): Promise<void>;
}

/** Repository interface for the email notification queue. */
export interface INotificationQueueRepository {
  enqueue(tenantId: string, template: string, data: Record<string, unknown>): Promise<string>;
  fetchPending(limit?: number): Promise<QueuedNotification[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, attempts: number): Promise<void>;
  listForTenant(
    tenantId: string,
    opts?: { limit?: number; offset?: number; status?: NotificationStatus },
  ): Promise<{ entries: QueuedNotification[]; total: number }>;
}
