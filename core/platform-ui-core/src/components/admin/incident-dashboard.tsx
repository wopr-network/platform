"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type CommunicateContext,
  classifyIncidentSeverity,
  type EscalationContact,
  type EscalationResult,
  generatePostmortem,
  getCommunicationTemplates,
  getEscalationMatrix,
  getResponseProcedure,
  type IncidentSeverity,
  type PostmortemInput,
  type ResponseProcedure,
  type SeverityResult,
  type SeveritySignals,
} from "@/lib/admin-incident-api";
import { toUserMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const colors: Record<IncidentSeverity, string> = {
    SEV1: "bg-red-500/15 text-red-400 border-red-500/20",
    SEV2: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    SEV3: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  };
  return (
    <Badge
      variant="secondary"
      className={cn("text-xs px-2 py-0.5 border font-mono", colors[severity])}
    >
      {severity}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Severity Classifier Panel
// ---------------------------------------------------------------------------

function SeverityClassifierPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeverityResult | null>(null);
  const [signals, setSignals] = useState<SeveritySignals>({
    stripeReachable: true,
    gatewayErrorRate: 0,
    creditDeductionFailures: 0,
    dlqDepth: 0,
    tenantsWithNegativeBalance: 0,
    autoTopupFailures: 0,
    firingAlertCount: 0,
  });

  async function handleClassify() {
    setLoading(true);
    try {
      const r = await classifyIncidentSeverity(signals);
      setResult(r);
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to classify severity"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Severity Classifier</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Stripe Reachable</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSignals((s) => ({ ...s, stripeReachable: true }))}
                className={cn(
                  "text-xs px-2 py-1 rounded border transition-colors",
                  signals.stripeReachable
                    ? "bg-green-500/15 border-green-500/30 text-green-400"
                    : "border-border text-muted-foreground",
                )}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setSignals((s) => ({ ...s, stripeReachable: false }))}
                className={cn(
                  "text-xs px-2 py-1 rounded border transition-colors",
                  !signals.stripeReachable
                    ? "bg-red-500/15 border-red-500/30 text-red-400"
                    : "border-border text-muted-foreground",
                )}
              >
                No
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Gateway Error Rate</Label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={signals.gatewayErrorRate}
              onChange={(e) =>
                setSignals((s) => ({
                  ...s,
                  gatewayErrorRate: Number.parseFloat(e.target.value) || 0,
                }))
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">DLQ Depth</Label>
            <Input
              type="number"
              min={0}
              value={signals.dlqDepth}
              onChange={(e) =>
                setSignals((s) => ({ ...s, dlqDepth: Number.parseInt(e.target.value, 10) || 0 }))
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Firing Alerts</Label>
            <Input
              type="number"
              min={0}
              value={signals.firingAlertCount}
              onChange={(e) =>
                setSignals((s) => ({
                  ...s,
                  firingAlertCount: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Credit Failures</Label>
            <Input
              type="number"
              min={0}
              value={signals.creditDeductionFailures}
              onChange={(e) =>
                setSignals((s) => ({
                  ...s,
                  creditDeductionFailures: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Negative Balance Tenants</Label>
            <Input
              type="number"
              min={0}
              value={signals.tenantsWithNegativeBalance}
              onChange={(e) =>
                setSignals((s) => ({
                  ...s,
                  tenantsWithNegativeBalance: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Auto-Topup Failures</Label>
            <Input
              type="number"
              min={0}
              value={signals.autoTopupFailures}
              onChange={(e) =>
                setSignals((s) => ({
                  ...s,
                  autoTopupFailures: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
              className="h-7 text-xs"
            />
          </div>
        </div>
        <Button size="sm" onClick={handleClassify} disabled={loading}>
          {loading ? "Classifying..." : "Classify Severity"}
        </Button>
        {result && (
          <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/30">
            <SeverityBadge severity={result.severity} />
            <div>
              <div className="text-sm font-medium">{result.label}</div>
              <div className="text-xs text-muted-foreground">{result.description}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Escalation Matrix Panel
// ---------------------------------------------------------------------------

function EscalationPanel() {
  const [severity, setSeverity] = useState<IncidentSeverity>("SEV1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EscalationResult | null>(null);

  async function handleLoad() {
    setLoading(true);
    try {
      const r = await getEscalationMatrix(severity);
      setResult(r);
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to load escalation matrix"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Escalation Matrix</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {(["SEV1", "SEV2", "SEV3"] as IncidentSeverity[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSeverity(s);
                setResult(null);
              }}
              className={cn(
                "text-xs px-3 py-1 rounded border transition-colors font-mono",
                severity === s
                  ? "bg-terminal/10 border-terminal/30 text-terminal"
                  : "border-border text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
          <Button size="sm" onClick={handleLoad} disabled={loading} className="ml-auto">
            {loading ? "Loading..." : "Load Escalation"}
          </Button>
        </div>
        {result && (
          <div className="space-y-2">
            {result.contacts.map((contact: EscalationContact, i: number) => (
              <div
                key={`${contact.role}-${i}`}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-sm"
              >
                <div>
                  <span className="font-medium">{contact.role}</span>
                  {contact.name && (
                    <span className="text-muted-foreground ml-2">— {contact.name}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {contact.method} · within {contact.within}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Response Procedure Panel
// ---------------------------------------------------------------------------

function ResponseProcedurePanel() {
  const [severity, setSeverity] = useState<IncidentSeverity>("SEV1");
  const [loading, setLoading] = useState(false);
  const [procedure, setProcedure] = useState<ResponseProcedure | null>(null);

  async function handleLoad() {
    setLoading(true);
    try {
      const r = await getResponseProcedure(severity);
      setProcedure(r);
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to load response procedure"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Response Procedure</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {(["SEV1", "SEV2", "SEV3"] as IncidentSeverity[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSeverity(s);
                setProcedure(null);
              }}
              className={cn(
                "text-xs px-3 py-1 rounded border transition-colors font-mono",
                severity === s
                  ? "bg-terminal/10 border-terminal/30 text-terminal"
                  : "border-border text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
          <Button size="sm" onClick={handleLoad} disabled={loading} className="ml-auto">
            {loading ? "Loading..." : "Load Procedure"}
          </Button>
        </div>
        {procedure && (
          <ol className="space-y-2 list-decimal list-inside">
            {procedure.steps.map((step: string, index: number) => (
              <li key={`${index}-${step.slice(0, 20)}`} className="text-sm text-muted-foreground">
                {step}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Communication Templates Panel
// ---------------------------------------------------------------------------

function CommunicationPanel() {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<{ customer: string; internal: string } | null>(null);
  const [form, setForm] = useState<CommunicateContext>({
    severity: "SEV1",
    incidentId: "",
    startedAt: new Date().toISOString(),
    affectedSystems: [],
    customerImpact: "",
    currentStatus: "investigating",
  });
  const [affectedSystemsText, setAffectedSystemsText] = useState("");

  async function handleGenerate() {
    if (!form.incidentId.trim()) {
      toast.error("Incident ID is required");
      return;
    }
    setLoading(true);
    try {
      const ctx: CommunicateContext = {
        ...form,
        affectedSystems: affectedSystemsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const result = await getCommunicationTemplates(ctx);
      setTemplates(result);
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to generate templates"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Communication Templates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Severity</Label>
            <div className="flex gap-1">
              {(["SEV1", "SEV2", "SEV3"] as IncidentSeverity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, severity: s }))}
                  className={cn(
                    "text-xs px-2 py-1 rounded border transition-colors font-mono",
                    form.severity === s
                      ? "bg-terminal/10 border-terminal/30 text-terminal"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Incident ID</Label>
            <Input
              value={form.incidentId}
              onChange={(e) => setForm((f) => ({ ...f, incidentId: e.target.value }))}
              placeholder="INC-001"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Started At (ISO)</Label>
            <Input
              value={form.startedAt}
              onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Affected Systems (comma-separated)
            </Label>
            <Input
              value={affectedSystemsText}
              onChange={(e) => setAffectedSystemsText(e.target.value)}
              placeholder="billing, gateway, auth"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Current Status</Label>
            <Input
              value={form.currentStatus}
              onChange={(e) => setForm((f) => ({ ...f, currentStatus: e.target.value }))}
              placeholder="investigating"
              className="h-7 text-xs"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-muted-foreground">Customer Impact</Label>
            <Textarea
              value={form.customerImpact}
              onChange={(e) => setForm((f) => ({ ...f, customerImpact: e.target.value }))}
              placeholder="Describe the customer-facing impact..."
              className="text-xs min-h-[60px]"
            />
          </div>
        </div>
        <Button size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating..." : "Generate Templates"}
        </Button>
        {templates && (
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Customer Template
              </div>
              <pre className="text-xs bg-muted/30 rounded p-3 whitespace-pre-wrap font-mono border border-border/50">
                {templates.customer}
              </pre>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Internal Template
              </div>
              <pre className="text-xs bg-muted/30 rounded p-3 whitespace-pre-wrap font-mono border border-border/50">
                {templates.internal}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Postmortem Generator Panel
// ---------------------------------------------------------------------------

function PostmortemPanel() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [form, setForm] = useState<PostmortemInput>({
    incidentId: "",
    severity: "SEV1",
    title: "",
    startedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
    resolvedAt: null,
    affectedSystems: [],
    affectedTenantCount: 0,
    revenueImpactDollars: null,
  });
  const [affectedSystemsText, setAffectedSystemsText] = useState("");

  async function handleGenerate() {
    if (!form.incidentId.trim() || !form.title.trim()) {
      toast.error("Incident ID and title are required");
      return;
    }
    setLoading(true);
    try {
      const input: PostmortemInput = {
        ...form,
        affectedSystems: affectedSystemsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const r = await generatePostmortem(input);
      setReport(r);
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to generate postmortem"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Post-Mortem Generator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Incident ID</Label>
            <Input
              value={form.incidentId}
              onChange={(e) => setForm((f) => ({ ...f, incidentId: e.target.value }))}
              placeholder="INC-001"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Severity</Label>
            <div className="flex gap-1">
              {(["SEV1", "SEV2", "SEV3"] as IncidentSeverity[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, severity: s }))}
                  className={cn(
                    "text-xs px-2 py-1 rounded border transition-colors font-mono",
                    form.severity === s
                      ? "bg-terminal/10 border-terminal/30 text-terminal"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Payment gateway outage"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Started At (ISO)</Label>
            <Input
              value={form.startedAt}
              onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Detected At (ISO)</Label>
            <Input
              value={form.detectedAt}
              onChange={(e) => setForm((f) => ({ ...f, detectedAt: e.target.value }))}
              className="h-7 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Resolved At (ISO, optional)</Label>
            <Input
              value={form.resolvedAt ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, resolvedAt: e.target.value || null }))}
              placeholder="Leave blank if unresolved"
              className="h-7 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Affected Tenant Count</Label>
            <Input
              type="number"
              min={0}
              value={form.affectedTenantCount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  affectedTenantCount: Number.parseInt(e.target.value, 10) || 0,
                }))
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Affected Systems (comma-separated)
            </Label>
            <Input
              value={affectedSystemsText}
              onChange={(e) => setAffectedSystemsText(e.target.value)}
              placeholder="billing, gateway"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Revenue Impact (USD, optional)</Label>
            <Input
              type="number"
              min={0}
              value={form.revenueImpactDollars ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  revenueImpactDollars: e.target.value ? Number.parseFloat(e.target.value) : null,
                }))
              }
              placeholder="Leave blank if unknown"
              className="h-7 text-xs"
            />
          </div>
        </div>
        <Button size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating..." : "Generate Post-Mortem"}
        </Button>
        {report && (
          <pre className="text-xs bg-muted/30 rounded p-3 whitespace-pre-wrap font-mono border border-border/50 max-h-96 overflow-y-auto">
            {report}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab type and main dashboard
// ---------------------------------------------------------------------------

type Tab = "classify" | "escalation" | "procedure" | "communicate" | "postmortem";

const TABS: { id: Tab; label: string }[] = [
  { id: "classify", label: "Classify" },
  { id: "escalation", label: "Escalation" },
  { id: "procedure", label: "Procedure" },
  { id: "communicate", label: "Communications" },
  { id: "postmortem", label: "Post-Mortem" },
];

export function IncidentDashboard() {
  const [tab, setTab] = useState<Tab>("classify");

  return (
    <div className="space-y-4">
      {/* Tab nav */}
      <div className="flex gap-1 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "text-sm px-3 py-1.5 rounded-sm transition-colors",
              tab === t.id
                ? "bg-terminal/10 text-terminal font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "classify" && <SeverityClassifierPanel />}
      {tab === "escalation" && <EscalationPanel />}
      {tab === "procedure" && <ResponseProcedurePanel />}
      {tab === "communicate" && <CommunicationPanel />}
      {tab === "postmortem" && <PostmortemPanel />}
    </div>
  );
}
