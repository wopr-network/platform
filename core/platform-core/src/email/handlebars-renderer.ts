/**
 * HandlebarsRenderer — compiles DB-driven templates with Handlebars.
 *
 * Registers shared helpers (eq, gt, formatDate, escapeHtml) at module load
 * so every compiled template can use them.
 */

import Handlebars from "handlebars";
import type { INotificationTemplateRepository } from "./notification-template-repository.js";
import type { TemplateResult } from "./templates.js";

// ---------------------------------------------------------------------------
// Register global helpers
// ---------------------------------------------------------------------------

Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);

Handlebars.registerHelper("gt", (a: unknown, b: unknown) => Number(a) > Number(b));

Handlebars.registerHelper("formatDate", (timestamp: unknown) => {
  const ms = Number(timestamp);
  if (Number.isNaN(ms)) return String(timestamp);
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

Handlebars.registerHelper("escapeHtml", (text: unknown) => {
  const str = String(text ?? "");
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return new Handlebars.SafeString(str.replace(/[&<>"']/g, (c) => map[c] ?? c));
});

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class HandlebarsRenderer {
  constructor(private readonly templateRepo: INotificationTemplateRepository) {}

  /**
   * Render a named template with the given data.
   * Returns null if the template does not exist or is inactive.
   */
  async render(templateName: string, data: Record<string, unknown>): Promise<TemplateResult | null> {
    const template = await this.templateRepo.getByName(templateName);
    if (!template || !template.active) return null;

    const ctx = { currentYear: new Date().getFullYear(), ...data };
    const subject = Handlebars.compile(template.subject)(ctx);
    const html = Handlebars.compile(template.htmlBody)(ctx);
    const text = Handlebars.compile(template.textBody)(ctx);

    return { subject, html, text };
  }
}
