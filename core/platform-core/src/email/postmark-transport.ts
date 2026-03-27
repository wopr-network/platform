/**
 * Postmark email transport.
 *
 * Env vars:
 *   POSTMARK_API_KEY — server API token from Postmark
 */

import { ServerClient } from "postmark";
import { logger } from "../config/logger.js";
import type { EmailSendResult, EmailTransport, SendTemplateEmailOpts } from "./client.js";

export interface PostmarkTransportConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export class PostmarkTransport implements EmailTransport {
  private client: ServerClient;
  private from: string;
  private replyTo: string | undefined;

  constructor(config: PostmarkTransportConfig) {
    this.client = new ServerClient(config.apiKey);
    this.from = config.from;
    this.replyTo = config.replyTo;
  }

  async send(opts: SendTemplateEmailOpts): Promise<EmailSendResult> {
    const result = await this.client.sendEmail({
      From: this.from,
      To: opts.to,
      Subject: opts.subject,
      HtmlBody: opts.html,
      TextBody: opts.text,
      ReplyTo: this.replyTo,
      MessageStream: "outbound",
    });

    if (result.ErrorCode !== 0) {
      logger.error("Failed to send email via Postmark", {
        to: opts.to,
        template: opts.templateName,
        error: result.Message,
        code: result.ErrorCode,
      });
      throw new Error(`Postmark error ${result.ErrorCode}: ${result.Message}`);
    }

    logger.info("Email sent via Postmark", {
      emailId: result.MessageID,
      to: opts.to,
      template: opts.templateName,
      userId: opts.userId,
    });

    return { id: result.MessageID, success: true };
  }
}
