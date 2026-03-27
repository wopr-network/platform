/**
 * Email — Transactional email system via Resend.
 *
 * Provides:
 * - EmailClient for sending template-based emails
 * - 8 email templates (verify, welcome, password-reset, credit-purchase, low-balance, bot-suspended, bot-destruction, data-deleted)
 * - BillingEmailService for deduplication + billing notifications (WOP-450)
 * - Email verification flow (token generation, validation)
 * - requireEmailVerified middleware for gating actions
 */

export type { BillingEmailServiceConfig, BillingEmailType } from "./billing-emails.js";
export { BillingEmailService } from "./billing-emails.js";
export type { EmailClientConfig, EmailClientOverrides, EmailSendResult, SendTemplateEmailOpts } from "./client.js";
export { EmailClient, getEmailClient, resetEmailClient, setEmailClient } from "./client.js";
export { DEFAULT_TEMPLATES } from "./default-templates.js";
export type { IBillingEmailRepository } from "./drizzle-billing-email-repository.js";
export { DrizzleBillingEmailRepository } from "./drizzle-billing-email-repository.js";
export { DrizzleNotificationTemplateRepository } from "./drizzle-notification-template-repository.js";
export { HandlebarsRenderer } from "./handlebars-renderer.js";
export type { INotificationPreferencesRepository } from "./notification-preferences-store.js";
export { DrizzleNotificationPreferencesStore } from "./notification-preferences-store.js";
export type { INotificationQueueRepository } from "./notification-queue-store.js";
export { DrizzleNotificationQueueStore } from "./notification-queue-store.js";
export type {
  NotificationEmailType,
  NotificationInput,
  NotificationPrefs,
  NotificationRow,
  NotificationStatus,
  QueuedNotification,
} from "./notification-repository-types.js";
export { NotificationService } from "./notification-service.js";
export type { INotificationTemplateRepository, NotificationTemplateRow } from "./notification-template-repository.js";
export type { TemplateName as NotificationTemplateName } from "./notification-templates.js";
export { renderNotificationTemplate } from "./notification-templates.js";
export { NotificationWorker } from "./notification-worker.js";
export type { IEmailVerifier } from "./require-verified.js";
export { requireEmailVerified } from "./require-verified.js";
export type { EmailOptions } from "./resend-adapter.js";
export { escapeHtml, passwordResetTemplate, passwordResetText, sendEmail } from "./resend-adapter.js";
export type { TemplateName, TemplateResult } from "./templates.js";
export {
  botDestructionTemplate,
  botSuspendedTemplate,
  creditPurchaseTemplate,
  dataDeletedTemplate,
  lowBalanceTemplate,
  passwordResetEmailTemplate,
  verifyEmailTemplate,
  welcomeTemplate,
} from "./templates.js";
export type { VerificationToken } from "./verification.js";
export {
  generateVerificationToken,
  getUserEmail,
  initVerificationSchema,
  isEmailVerified,
  PgEmailVerifier,
  verifyToken,
} from "./verification.js";
