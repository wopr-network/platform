/**
 * Email Client — Template-based transactional email sender.
 *
 * Supports three backends (first match wins):
 * 1. **AWS SES**: Set AWS_SES_REGION env var (+ AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * 2. **Postmark**: Set POSTMARK_API_KEY env var
 * 3. **Resend**: Set RESEND_API_KEY env var
 */

import { Resend } from "resend";
import { logger } from "../config/logger.js";

export interface EmailClientConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export interface SendTemplateEmailOpts {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Audit metadata: who triggered this email */
  userId?: string;
  /** Audit metadata: which template was used */
  templateName?: string;
}

export interface EmailSendResult {
  id: string;
  success: boolean;
}

/** Transport abstraction — any backend that can send an email. */
export interface EmailTransport {
  send(opts: SendTemplateEmailOpts): Promise<EmailSendResult>;
}

/**
 * Transactional email client with pluggable transport.
 *
 * Usage:
 * ```ts
 * const client = new EmailClient({ apiKey: "re_xxx", from: "noreply@example.com" });
 * const template = verifyEmailTemplate(url, email);
 * await client.send({ to: email, ...template, userId: "user-123", templateName: "verify-email" });
 * ```
 */
export class EmailClient {
  private transport: EmailTransport;
  private onSend: ((opts: SendTemplateEmailOpts, result: EmailSendResult) => void) | null = null;

  constructor(configOrTransport: EmailClientConfig | EmailTransport) {
    if ("send" in configOrTransport) {
      this.transport = configOrTransport;
    } else {
      this.transport = new ResendTransport(configOrTransport);
    }
  }

  /** Register a callback invoked after each successful send (for audit logging). */
  onEmailSent(callback: (opts: SendTemplateEmailOpts, result: EmailSendResult) => void): void {
    this.onSend = callback;
  }

  /** Send a transactional email. */
  async send(opts: SendTemplateEmailOpts): Promise<EmailSendResult> {
    const result = await this.transport.send(opts);

    if (this.onSend) {
      try {
        this.onSend(opts, result);
      } catch {
        // Audit callback failure should not break email sending
      }
    }

    return result;
  }
}

/** Resend-backed transport (original implementation). */
class ResendTransport implements EmailTransport {
  private resend: Resend;
  private from: string;
  private replyTo: string | undefined;

  constructor(config: EmailClientConfig) {
    this.resend = new Resend(config.apiKey);
    this.from = config.from;
    this.replyTo = config.replyTo;
  }

  async send(opts: SendTemplateEmailOpts): Promise<EmailSendResult> {
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      replyTo: this.replyTo,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });

    if (error) {
      logger.error("Failed to send email via Resend", {
        to: opts.to,
        template: opts.templateName,
        error: error.message,
      });
      throw new Error(`Failed to send email: ${error.message}`);
    }

    const result: EmailSendResult = {
      id: data?.id || "",
      success: true,
    };

    logger.info("Email sent via Resend", {
      emailId: result.id,
      to: opts.to,
      template: opts.templateName,
      userId: opts.userId,
    });

    return result;
  }
}

/** No-op transport that logs but does not send. Used when EMAIL_DISABLED=true. */
class NoopTransport implements EmailTransport {
  async send(opts: SendTemplateEmailOpts): Promise<EmailSendResult> {
    logger.info("Email suppressed (EMAIL_DISABLED)", {
      to: opts.to,
      template: opts.templateName,
      userId: opts.userId,
    });
    return { id: "noop", success: true };
  }
}

/**
 * Create a lazily-initialized singleton EmailClient from environment variables.
 *
 * Backend selection (first match wins):
 * 1. AWS SES — AWS_SES_REGION is set
 * 2. Postmark — POSTMARK_API_KEY is set
 * 3. Resend — RESEND_API_KEY is set
 *
 * Common env vars:
 * - EMAIL_FROM (default: "noreply@wopr.bot") — sender address
 * - EMAIL_REPLY_TO (default: "support@wopr.bot") — reply-to address
 *
 * SES env vars:
 * - AWS_SES_REGION (e.g. "us-east-1")
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 *
 * Postmark env vars:
 * - POSTMARK_API_KEY (server token from Postmark dashboard)
 *
 * Resend env vars:
 * - RESEND_API_KEY
 *
 * Legacy env vars (still supported):
 * - RESEND_FROM → falls back if EMAIL_FROM is not set
 * - RESEND_REPLY_TO → falls back if EMAIL_REPLY_TO is not set
 */
let _client: EmailClient | null = null;

export interface EmailClientOverrides {
  /** Sender address — overrides EMAIL_FROM env var. */
  from?: string;
  /** Reply-to address — overrides EMAIL_REPLY_TO env var. */
  replyTo?: string;
  /** Postmark API key — from Vault secrets. Overrides POSTMARK_API_KEY env var. */
  postmarkApiKey?: string | null;
  /** Resend API key — from Vault secrets. Overrides RESEND_API_KEY env var. */
  resendApiKey?: string | null;
}

/**
 * Create a lazily-initialized singleton EmailClient.
 *
 * Optional overrides (from DB-driven product config) take precedence
 * over env vars. Pass them on first call; subsequent calls return the
 * cached singleton.
 */
export function getEmailClient(overrides?: EmailClientOverrides): EmailClient {
  if (!_client) {
    const from = overrides?.from || "noreply@wopr.bot";
    const replyTo = overrides?.replyTo || "support@wopr.bot";

    if (overrides?.resendApiKey) {
      _client = new EmailClient({ apiKey: overrides.resendApiKey, from, replyTo });
      logger.info("Email client initialized with Resend", { from });
    } else {
      _client = new EmailClient(new NoopTransport());
      logger.warn("No email API key provided — email disabled");
    }
  }
  return _client;
}

/** Reset the singleton (for testing). */
export function resetEmailClient(): void {
  _client = null;
}

/** Replace the singleton (for testing). */
export function setEmailClient(client: EmailClient): void {
  _client = client;
}
