import { sql } from "drizzle-orm";
import { bigint, boolean, pgTable, text } from "drizzle-orm/pg-core";

/**
 * DB-driven email templates with Handlebars syntax.
 * Each row stores a named template (subject + HTML + text bodies).
 * Admins can edit these at runtime without code deploys.
 */
export const notificationTemplates = pgTable("notification_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull().default(sql`(extract(epoch from now()))::bigint`),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(sql`(extract(epoch from now()))::bigint`),
});
