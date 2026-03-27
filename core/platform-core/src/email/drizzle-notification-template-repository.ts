/**
 * DrizzleNotificationTemplateRepository — Drizzle ORM implementation
 * of INotificationTemplateRepository.
 */

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { notificationTemplates } from "../db/schema/notification-templates.js";
import type { INotificationTemplateRepository, NotificationTemplateRow } from "./notification-repository-types.js";

export class DrizzleNotificationTemplateRepository implements INotificationTemplateRepository {
  constructor(private readonly db: PgDatabase<never>) {}

  async getByName(name: string): Promise<NotificationTemplateRow | null> {
    const rows = await this.db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.name, name))
      .limit(1);
    if (rows.length === 0) return null;
    return this.toRow(rows[0]);
  }

  async list(): Promise<NotificationTemplateRow[]> {
    const rows = await this.db.select().from(notificationTemplates);
    return rows.map((r) => this.toRow(r));
  }

  async upsert(
    name: string,
    template: Omit<NotificationTemplateRow, "id" | "name" | "createdAt" | "updatedAt">,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .insert(notificationTemplates)
      .values({
        id: crypto.randomUUID(),
        name,
        description: template.description,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        active: template.active,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: notificationTemplates.name,
        set: {
          description: template.description,
          subject: template.subject,
          htmlBody: template.htmlBody,
          textBody: template.textBody,
          active: template.active,
          updatedAt: now,
        },
      });
  }

  async seed(
    templates: Array<{
      name: string;
      description: string;
      subject: string;
      htmlBody: string;
      textBody: string;
    }>,
  ): Promise<number> {
    if (templates.length === 0) return 0;

    const now = Math.floor(Date.now() / 1000);
    const values = templates.map((t) => ({
      id: crypto.randomUUID(),
      name: t.name,
      description: t.description,
      subject: t.subject,
      htmlBody: t.htmlBody,
      textBody: t.textBody,
      active: true,
      createdAt: now,
      updatedAt: now,
    }));

    // INSERT ... ON CONFLICT DO NOTHING — preserves admin edits
    const result = await this.db
      .insert(notificationTemplates)
      .values(values)
      .onConflictDoNothing({ target: notificationTemplates.name })
      .returning({ id: notificationTemplates.id });

    return result.length;
  }

  /**
   * Re-seed all templates using upsert — overwrites existing content
   * while preserving row IDs and createdAt timestamps.
   */
  async reseedAll(
    templates: Array<{
      name: string;
      description: string;
      subject: string;
      htmlBody: string;
      textBody: string;
    }>,
  ): Promise<number> {
    let count = 0;
    for (const t of templates) {
      await this.upsert(t.name, {
        description: t.description,
        subject: t.subject,
        htmlBody: t.htmlBody,
        textBody: t.textBody,
        active: true,
      });
      count++;
    }
    return count;
  }

  private toRow(r: typeof notificationTemplates.$inferSelect): NotificationTemplateRow {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      subject: r.subject,
      htmlBody: r.htmlBody,
      textBody: r.textBody,
      active: r.active,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
