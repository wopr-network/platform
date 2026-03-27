/**
 * Admin tRPC router for managing DB-driven notification templates.
 *
 * All procedures require platform_admin role via adminProcedure.
 */

import { TRPCError } from "@trpc/server";
import Handlebars from "handlebars";
import { z } from "zod";
import { logger } from "../config/logger.js";
import { DEFAULT_TEMPLATES } from "../email/default-templates.js";
import type { INotificationTemplateRepository } from "../email/notification-template-repository.js";
import { adminProcedure, router } from "./init.js";

export function createNotificationTemplateRouter(getRepo: () => INotificationTemplateRepository) {
  return router({
    listTemplates: adminProcedure.query(async () => {
      const repo = getRepo();
      return repo.list();
    }),

    getTemplate: adminProcedure.input(z.object({ name: z.string() })).query(async ({ input }) => {
      const repo = getRepo();
      return repo.getByName(input.name);
    }),

    updateTemplate: adminProcedure
      .input(
        z.object({
          name: z.string(),
          subject: z.string().optional(),
          htmlBody: z.string().optional(),
          textBody: z.string().optional(),
          description: z.string().optional(),
          active: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const repo = getRepo();
        const existing = await repo.getByName(input.name);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Template "${input.name}" not found` });
        }
        await repo.upsert(input.name, {
          subject: input.subject ?? existing.subject,
          htmlBody: input.htmlBody ?? existing.htmlBody,
          textBody: input.textBody ?? existing.textBody,
          description: input.description ?? existing.description,
          active: input.active ?? existing.active,
        });
        logger.info("Notification template updated", {
          action: "notification_template.update",
          templateName: input.name,
        });
      }),

    previewTemplate: adminProcedure
      .input(
        z.object({
          subject: z.string(),
          htmlBody: z.string(),
          textBody: z.string(),
          data: z.record(z.string(), z.unknown()),
        }),
      )
      .mutation(({ input }) => {
        try {
          const subject = Handlebars.compile(input.subject)(input.data);
          const html = Handlebars.compile(input.htmlBody)(input.data);
          const text = Handlebars.compile(input.textBody)(input.data);
          return { subject, html, text };
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Template render error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }),

    seedDefaults: adminProcedure.mutation(async () => {
      const repo = getRepo();
      const inserted = await repo.seed(DEFAULT_TEMPLATES);
      logger.info("Notification template defaults seeded", {
        action: "notification_template.seed",
        inserted,
        total: DEFAULT_TEMPLATES.length,
      });
      return { inserted, total: DEFAULT_TEMPLATES.length };
    }),
  });
}
