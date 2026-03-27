/**
 * AWS SES Email Transport.
 *
 * Drop-in alternative to Resend for transactional email.
 * Activated when AWS_SES_REGION env var is set.
 *
 * Required env vars:
 * - AWS_SES_REGION (e.g. "us-east-1")
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { logger } from "../config/logger.js";
import type { EmailSendResult, EmailTransport, SendTemplateEmailOpts } from "./client.js";

export interface SesTransportConfig {
  region: string;
  from: string;
  replyTo?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class SesTransport implements EmailTransport {
  private client: SESClient;
  private from: string;
  private replyTo: string | undefined;

  constructor(config: SesTransportConfig) {
    const credentials =
      config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined;

    this.client = new SESClient({
      region: config.region,
      ...(credentials ? { credentials } : {}),
    });
    this.from = config.from;
    this.replyTo = config.replyTo;
  }

  async send(opts: SendTemplateEmailOpts): Promise<EmailSendResult> {
    const command = new SendEmailCommand({
      Source: this.from,
      ReplyToAddresses: this.replyTo ? [this.replyTo] : undefined,
      Destination: { ToAddresses: [opts.to] },
      Message: {
        Subject: { Data: opts.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: opts.html, Charset: "UTF-8" },
          ...(opts.text ? { Text: { Data: opts.text, Charset: "UTF-8" } } : {}),
        },
      },
    });

    try {
      const response = await this.client.send(command);
      const messageId = response.MessageId || "";

      logger.info("Email sent via SES", {
        messageId,
        to: opts.to,
        template: opts.templateName,
        userId: opts.userId,
      });

      return { id: messageId, success: true };
    } catch (error) {
      logger.error("Failed to send email via SES", {
        to: opts.to,
        template: opts.templateName,
        userId: opts.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
