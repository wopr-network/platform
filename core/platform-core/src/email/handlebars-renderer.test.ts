import { describe, expect, it, vi } from "vitest";
import { HandlebarsRenderer } from "./handlebars-renderer.js";
import type { INotificationTemplateRepository, NotificationTemplateRow } from "./notification-repository-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(overrides: Partial<NotificationTemplateRow> = {}): NotificationTemplateRow {
  return {
    id: "tpl-1",
    name: "test-template",
    description: "A test template",
    subject: "Hello {{name}}",
    htmlBody: "<h1>Hello {{name}}</h1>",
    textBody: "Hello {{name}}",
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeRepo(templates: Record<string, NotificationTemplateRow | null> = {}): INotificationTemplateRepository {
  return {
    getByName: vi.fn().mockImplementation((name: string) => Promise.resolve(templates[name] ?? null)),
    list: vi.fn().mockResolvedValue(Object.values(templates).filter(Boolean)),
    upsert: vi.fn().mockResolvedValue(undefined),
  } as unknown as INotificationTemplateRepository;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HandlebarsRenderer", () => {
  it("returns null for unknown template", async () => {
    const repo = makeRepo({});
    const renderer = new HandlebarsRenderer(repo);

    const result = await renderer.render("nonexistent", { name: "World" });

    expect(result).toBeNull();
    expect(repo.getByName).toHaveBeenCalledWith("nonexistent");
  });

  it("returns null for inactive template", async () => {
    const repo = makeRepo({
      "inactive-tpl": makeTemplate({ name: "inactive-tpl", active: false }),
    });
    const renderer = new HandlebarsRenderer(repo);

    const result = await renderer.render("inactive-tpl", { name: "World" });

    expect(result).toBeNull();
  });

  it("compiles Handlebars and returns subject/html/text", async () => {
    const repo = makeRepo({
      greeting: makeTemplate({
        name: "greeting",
        subject: "Hi {{name}}!",
        htmlBody: "<p>Welcome, {{name}}!</p>",
        textBody: "Welcome, {{name}}!",
      }),
    });
    const renderer = new HandlebarsRenderer(repo);

    const result = await renderer.render("greeting", { name: "Alice" });

    expect(result).not.toBeNull();
    expect(result?.subject).toBe("Hi Alice!");
    expect(result?.html).toBe("<p>Welcome, Alice!</p>");
    expect(result?.text).toBe("Welcome, Alice!");
  });

  it("injects currentYear automatically", async () => {
    const repo = makeRepo({
      footer: makeTemplate({
        name: "footer",
        subject: "Year: {{currentYear}}",
        htmlBody: "<p>&copy; {{currentYear}}</p>",
        textBody: "(c) {{currentYear}}",
      }),
    });
    const renderer = new HandlebarsRenderer(repo);

    const result = await renderer.render("footer", {});

    const year = new Date().getFullYear();
    expect(result?.subject).toBe(`Year: ${year}`);
    expect(result?.html).toBe(`<p>&copy; ${year}</p>`);
    expect(result?.text).toBe(`(c) ${year}`);
  });

  it("does not override explicit currentYear from data", async () => {
    const repo = makeRepo({
      footer: makeTemplate({
        name: "footer",
        subject: "Year: {{currentYear}}",
        htmlBody: "<p>{{currentYear}}</p>",
        textBody: "{{currentYear}}",
      }),
    });
    const renderer = new HandlebarsRenderer(repo);

    const result = await renderer.render("footer", { currentYear: 2099 });

    expect(result?.subject).toBe("Year: 2099");
  });

  describe("helpers", () => {
    it("eq helper returns true for equal values", async () => {
      const repo = makeRepo({
        cond: makeTemplate({
          name: "cond",
          subject: '{{#if (eq status "active")}}Active{{else}}Inactive{{/if}}',
          htmlBody: "ok",
          textBody: "ok",
        }),
      });
      const renderer = new HandlebarsRenderer(repo);

      const active = await renderer.render("cond", { status: "active" });
      expect(active?.subject).toBe("Active");

      const inactive = await renderer.render("cond", { status: "disabled" });
      expect(inactive?.subject).toBe("Inactive");
    });

    it("gt helper compares numbers", async () => {
      const repo = makeRepo({
        gt: makeTemplate({
          name: "gt",
          subject: "{{#if (gt count 5)}}Many{{else}}Few{{/if}}",
          htmlBody: "ok",
          textBody: "ok",
        }),
      });
      const renderer = new HandlebarsRenderer(repo);

      const many = await renderer.render("gt", { count: 10 });
      expect(many?.subject).toBe("Many");

      const few = await renderer.render("gt", { count: 3 });
      expect(few?.subject).toBe("Few");
    });

    it("formatDate helper formats timestamps", async () => {
      const repo = makeRepo({
        dated: makeTemplate({
          name: "dated",
          subject: "Date: {{formatDate ts}}",
          htmlBody: "ok",
          textBody: "ok",
        }),
      });
      const renderer = new HandlebarsRenderer(repo);

      // Use noon UTC to avoid timezone date-boundary shifts
      const ts = new Date("2025-01-15T12:00:00Z").getTime();
      const result = await renderer.render("dated", { ts });

      // The formatted string uses en-US locale with year/month/day
      const expected = new Date(ts).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      expect(result?.subject).toBe(`Date: ${expected}`);
    });

    it("formatDate helper passes through non-numeric values", async () => {
      const repo = makeRepo({
        dated: makeTemplate({
          name: "dated",
          subject: "Date: {{formatDate ts}}",
          htmlBody: "ok",
          textBody: "ok",
        }),
      });
      const renderer = new HandlebarsRenderer(repo);

      const result = await renderer.render("dated", { ts: "not-a-number" });

      expect(result?.subject).toBe("Date: not-a-number");
    });

    it("escapeHtml helper escapes special characters", async () => {
      const repo = makeRepo({
        esc: makeTemplate({
          name: "esc",
          subject: "Safe: {{escapeHtml input}}",
          htmlBody: "ok",
          textBody: "ok",
        }),
      });
      const renderer = new HandlebarsRenderer(repo);

      const result = await renderer.render("esc", {
        input: '<script>alert("xss")</script>',
      });

      expect(result?.subject).toContain("&lt;script&gt;");
      expect(result?.subject).toContain("&quot;xss&quot;");
      expect(result?.subject).not.toContain("<script>");
    });
  });
});
