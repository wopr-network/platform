"use client";

import { Eye, Mail, MailCheck, Save, Search, Sprout, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  htmlBody: string;
  textBody: string;
  active: boolean;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Variable map — derived from template name                          */
/* ------------------------------------------------------------------ */

const TEMPLATE_VARIABLES: Record<string, string[]> = {
  welcome: ["userName", "loginUrl", "platformName"],
  "password-reset": ["userName", "resetUrl", "expiresIn"],
  "email-verification": ["userName", "verifyUrl", "expiresIn"],
  "invite-member": ["inviterName", "orgName", "role", "inviteUrl", "expiresIn"],
  "payment-receipt": ["userName", "amount", "currency", "date", "invoiceUrl"],
  "payment-failed": ["userName", "amount", "currency", "retryUrl"],
  "credits-low": ["userName", "balance", "topupUrl"],
  "usage-alert": ["userName", "usagePercent", "limit", "settingsUrl"],
  "instance-down": ["userName", "instanceName", "downSince", "dashboardUrl"],
  "instance-recovered": ["userName", "instanceName", "recoveredAt", "dashboardUrl"],
};

function getVariablesForTemplate(name: string): string[] {
  const key = name.toLowerCase().replace(/_/g, "-");
  for (const [pattern, vars] of Object.entries(TEMPLATE_VARIABLES)) {
    if (key.includes(pattern)) return vars;
  }
  return ["userName", "platformName"];
}

function buildSampleData(variables: string[]): Record<string, string> {
  const samples: Record<string, string> = {
    userName: "Jane Doe",
    loginUrl: "https://app.example.com/login",
    platformName: "Platform",
    resetUrl: "https://app.example.com/reset?token=abc",
    verifyUrl: "https://app.example.com/verify?token=abc",
    expiresIn: "24 hours",
    inviterName: "John Admin",
    orgName: "Acme Corp",
    role: "member",
    inviteUrl: "https://app.example.com/invite?token=abc",
    amount: "$25.00",
    currency: "USD",
    date: new Date().toLocaleDateString(),
    invoiceUrl: "https://app.example.com/invoices/123",
    retryUrl: "https://app.example.com/billing",
    balance: "$2.50",
    topupUrl: "https://app.example.com/billing/topup",
    usagePercent: "90%",
    limit: "$100.00",
    settingsUrl: "https://app.example.com/settings",
    instanceName: "prod-bot-1",
    downSince: "10 minutes ago",
    recoveredAt: new Date().toLocaleTimeString(),
    dashboardUrl: "https://app.example.com/fleet",
  };
  const result: Record<string, string> = {};
  for (const v of variables) {
    result[v] = samples[v] ?? `{{${v}}}`;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function EmailTemplatesClient() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // --- Editor state ---
  const [editDescription, setEditDescription] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editHtmlBody, setEditHtmlBody] = useState("");
  const [editTextBody, setEditTextBody] = useState("");
  const [editActive, setEditActive] = useState(true);

  // --- Preview state ---
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // --- Queries ---
  const listQuery = trpc.notificationTemplates.listTemplates.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // --- Mutations ---
  const updateMutation = trpc.notificationTemplates.updateTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template saved successfully.");
      utils.notificationTemplates.listTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to save template: ${err.message}`);
    },
  });

  const previewMutation = trpc.notificationTemplates.previewTemplate.useMutation({
    onError: (err) => {
      toast.error(`Preview failed: ${err.message}`);
    },
  });

  const seedMutation = trpc.notificationTemplates.seedDefaults.useMutation({
    // NOTE: Cast needed because trpc-types.ts uses AnyTRPCMutationProcedure stubs
    // that erase return types. Remove when @wopr-network/sdk is published.
    onSuccess: (data: unknown) => {
      const result = data as { seeded: number } | undefined;
      const count = result?.seeded ?? 0;
      toast.success(`Seeded ${count} default template${count !== 1 ? "s" : ""}.`);
      utils.notificationTemplates.listTemplates.invalidate();
    },
    onError: (err) => {
      toast.error(`Seed failed: ${err.message}`);
    },
  });

  // --- Derived data ---
  // NOTE: Cast needed because trpc-types.ts uses AnyTRPCMutationProcedure stubs
  // that erase return types. Remove when @wopr-network/sdk is published.
  const templates = (listQuery.data ?? []) as EmailTemplate[];

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q),
    );
  }, [templates, search]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  // --- Handlers ---

  const openEditor = useCallback((template: EmailTemplate) => {
    setSelectedId(template.id);
    setEditDescription(template.description ?? "");
    setEditSubject(template.subject);
    setEditHtmlBody(template.htmlBody);
    setEditTextBody(template.textBody);
    setEditActive(template.active);
    setPreviewHtml(null);
    setPreviewSubject(null);
    setPreviewText(null);
  }, []);

  const closeEditor = useCallback(() => {
    // Dirty check — warn if editor state differs from loaded template values
    if (selectedTemplate) {
      const isDirty =
        editDescription !== (selectedTemplate.description ?? "") ||
        editSubject !== selectedTemplate.subject ||
        editHtmlBody !== selectedTemplate.htmlBody ||
        editTextBody !== selectedTemplate.textBody ||
        editActive !== selectedTemplate.active;

      if (isDirty) {
        const confirmed = window.confirm(
          "You have unsaved changes. Are you sure you want to close without saving?",
        );
        if (!confirmed) return;
      }
    }

    setSelectedId(null);
    setPreviewHtml(null);
    setPreviewSubject(null);
    setPreviewText(null);
  }, [selectedTemplate, editDescription, editSubject, editHtmlBody, editTextBody, editActive]);

  const handleSave = useCallback(() => {
    if (!selectedId) return;
    updateMutation.mutate({
      id: selectedId,
      description: editDescription,
      subject: editSubject,
      htmlBody: editHtmlBody,
      textBody: editTextBody,
      active: editActive,
    });
  }, [
    selectedId,
    editDescription,
    editSubject,
    editHtmlBody,
    editTextBody,
    editActive,
    updateMutation,
  ]);

  const handlePreview = useCallback(() => {
    if (!selectedTemplate) return;
    const variables = getVariablesForTemplate(selectedTemplate.name);
    const sampleData = buildSampleData(variables);

    previewMutation.mutate(
      {
        id: selectedTemplate.id,
        subject: editSubject,
        htmlBody: editHtmlBody,
        textBody: editTextBody,
        sampleData,
      },
      {
        // NOTE: Cast needed because trpc-types.ts uses AnyTRPCMutationProcedure stubs
        // that erase return types. Remove when @wopr-network/sdk is published.
        onSuccess: (data: unknown) => {
          const result = data as {
            html: string;
            subject: string;
            text: string;
          } | null;
          if (result) {
            setPreviewHtml(result.html);
            setPreviewSubject(result.subject);
            setPreviewText(result.text);
          }
        },
      },
    );
  }, [selectedTemplate, editSubject, editHtmlBody, editTextBody, previewMutation]);

  const handleSeed = useCallback(() => {
    seedMutation.mutate(undefined);
  }, [seedMutation]);

  // --- Loading state ---

  if (listQuery.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={`skel-${i.toString()}`} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3">
        <p className="text-sm text-destructive font-mono">
          Failed to load email templates. Please try again.
        </p>
        <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  // --- Editor panel ---

  if (selectedTemplate) {
    const variables = getVariablesForTemplate(selectedTemplate.name);

    return (
      <div className="flex flex-col h-full">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={closeEditor}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4 mr-1" />
              Back
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <MailCheck className="size-4 text-amber-400" />
              <h2 className="text-lg font-bold uppercase tracking-wider">
                {selectedTemplate.name}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="border border-border hover:bg-secondary"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
            >
              <Eye className="size-4 mr-1.5" />
              {previewMutation.isPending ? "Rendering..." : "Preview"}
            </Button>
            <Button
              variant="ghost"
              className="bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              <Save className="size-4 mr-1.5" />
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: editor form */}
          <div className="flex-1 overflow-auto p-6 space-y-6">
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base">Template Settings</CardTitle>
                <CardDescription>
                  Edit the template content. Use Handlebars syntax (
                  <code className="text-xs font-mono text-amber-400">{"{{variableName}}"}</code>)
                  for dynamic values.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="tpl-description">Description</Label>
                  <Input
                    id="tpl-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Brief description of when this template is sent"
                    className="bg-black/20 border-border focus:border-amber-500/50"
                  />
                </div>

                {/* Subject */}
                <div className="space-y-2">
                  <Label htmlFor="tpl-subject">Subject Line</Label>
                  <Input
                    id="tpl-subject"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Email subject (supports Handlebars)"
                    className="font-mono text-sm bg-black/20 border-border focus:border-amber-500/50"
                  />
                </div>

                {/* HTML Body */}
                <div className="space-y-2">
                  <Label htmlFor="tpl-html">HTML Body</Label>
                  <Textarea
                    id="tpl-html"
                    value={editHtmlBody}
                    onChange={(e) => setEditHtmlBody(e.target.value)}
                    placeholder="HTML email body (supports Handlebars)"
                    className="min-h-[240px] font-mono text-sm leading-relaxed bg-black/20 border-border focus:border-amber-500/50"
                  />
                </div>

                {/* Text Body */}
                <div className="space-y-2">
                  <Label htmlFor="tpl-text">Text Body</Label>
                  <Textarea
                    id="tpl-text"
                    value={editTextBody}
                    onChange={(e) => setEditTextBody(e.target.value)}
                    placeholder="Plain text email body (supports Handlebars)"
                    className="min-h-[160px] font-mono text-sm leading-relaxed bg-black/20 border-border focus:border-amber-500/50"
                  />
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="space-y-0.5">
                    <Label>Active</Label>
                    <p className="text-xs text-muted-foreground">
                      Inactive templates will not be sent.
                    </p>
                  </div>
                  <Switch
                    checked={editActive}
                    onCheckedChange={setEditActive}
                    className="data-[state=checked]:bg-amber-500"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Available variables */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base">Available Variables</CardTitle>
                <CardDescription>
                  Use these in your template with Handlebars syntax.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {variables.map((v) => (
                    <Badge
                      key={v}
                      variant="outline"
                      className="border-amber-500/30 text-amber-400 font-mono text-xs"
                    >
                      {`{{${v}}}`}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: preview panel */}
          <div className="w-[480px] shrink-0 border-l border-border overflow-auto p-6 space-y-4">
            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Preview
            </h3>

            {previewHtml === null && previewSubject === null ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Eye className="size-8 mb-3 opacity-40" />
                <p className="text-sm font-mono">
                  Click &quot;Preview&quot; to render the template
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Rendered subject */}
                {previewSubject !== null && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Subject
                    </span>
                    <p className="text-sm font-medium rounded-md border border-border bg-black/20 px-3 py-2">
                      {previewSubject}
                    </p>
                  </div>
                )}

                {/* Rendered HTML */}
                {previewHtml !== null && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      HTML Preview
                    </span>
                    <div className="rounded-md border border-border overflow-auto max-h-[400px]">
                      <div
                        className="bg-white p-4 text-black text-sm [color-scheme:light]"
                        // biome-ignore lint/security/noDangerouslySetInnerHtml: Admin preview of controlled email template
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    </div>
                  </div>
                )}

                {/* Rendered text */}
                {previewText !== null && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Text Preview
                    </span>
                    <pre className="whitespace-pre-wrap rounded-md border border-border bg-black/20 p-3 text-xs font-mono leading-relaxed">
                      {previewText}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- List view ---

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="size-5 text-amber-400" />
          <h1 className="text-xl font-bold uppercase tracking-wider [text-shadow:0_0_10px_rgba(251,191,36,0.25)]">
            Email Templates
          </h1>
        </div>
        <Button
          variant="ghost"
          className="bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
          onClick={handleSeed}
          disabled={seedMutation.isPending}
        >
          <Sprout className="size-4 mr-1.5" />
          {seedMutation.isPending ? "Seeding..." : "Seed Defaults"}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-black/20 border-border focus:border-amber-500/50"
        />
      </div>

      {/* Table */}
      <div className="border border-amber-500/10 rounded-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary hover:bg-secondary">
              <TableHead className="text-xs uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Description</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Subject</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-xs uppercase tracking-wider">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <span className="text-sm text-muted-foreground font-mono">
                    {templates.length === 0
                      ? '> No templates found. Click "Seed Defaults" to create initial templates.'
                      : "> No templates match your search."}
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((template) => (
                <TableRow
                  key={template.id}
                  className="cursor-pointer hover:bg-secondary/50"
                  onClick={() => openEditor(template)}
                >
                  <TableCell>
                    <span className="text-sm font-medium font-mono">{template.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground line-clamp-1">
                      {template.description ?? "--"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground font-mono line-clamp-1 max-w-[200px]">
                      {template.subject}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        template.active
                          ? "border-amber-500/30 text-amber-400"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {template.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {new Date(template.updatedAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
