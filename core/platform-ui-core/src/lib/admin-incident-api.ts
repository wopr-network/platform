import { apiFetch } from "./api";

// --- Types ---

export type IncidentSeverity = "SEV1" | "SEV2" | "SEV3";

export interface SeveritySignals {
  stripeReachable: boolean;
  webhooksReceiving?: boolean | null;
  gatewayErrorRate: number;
  creditDeductionFailures: number;
  dlqDepth: number;
  tenantsWithNegativeBalance: number;
  autoTopupFailures: number;
  firingAlertCount: number;
}

export interface SeverityResult {
  severity: IncidentSeverity;
  label: string;
  description: string;
}

export interface EscalationContact {
  role: string;
  name: string;
  method: string;
  within: string;
}

export interface EscalationResult {
  severity: IncidentSeverity;
  contacts: EscalationContact[];
}

export interface ResponseProcedure {
  severity: IncidentSeverity;
  steps: string[];
}

export interface CommunicateContext {
  severity: IncidentSeverity;
  incidentId: string;
  startedAt: string;
  affectedSystems: string[];
  customerImpact: string;
  currentStatus: string;
}

export interface CommunicationTemplates {
  customer: string;
  internal: string;
}

export interface PostmortemInput {
  incidentId: string;
  severity: IncidentSeverity;
  title: string;
  startedAt: string;
  detectedAt: string;
  resolvedAt: string | null;
  affectedSystems: string[];
  affectedTenantCount: number;
  revenueImpactDollars: number | null;
}

// --- API calls ---

export async function classifyIncidentSeverity(signals: SeveritySignals): Promise<SeverityResult> {
  const result = await apiFetch<{ success: boolean; error?: string } & SeverityResult>(
    "/admin/incidents/severity",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signals),
    },
  );
  if (!result.success) throw new Error(result.error ?? "Request failed");
  return result;
}

export async function getEscalationMatrix(severity: IncidentSeverity): Promise<EscalationResult> {
  return apiFetch<EscalationResult>(`/admin/incidents/escalation/${severity}`);
}

export async function getResponseProcedure(severity: IncidentSeverity): Promise<ResponseProcedure> {
  const result = await apiFetch<{ success: boolean; procedure: ResponseProcedure; error?: string }>(
    `/admin/incidents/procedure/${severity}`,
  );
  if (!result.success) throw new Error(result.error ?? "Request failed");
  return result.procedure;
}

export async function getCommunicationTemplates(
  context: CommunicateContext,
): Promise<CommunicationTemplates> {
  const result = await apiFetch<{
    success: boolean;
    templates: CommunicationTemplates;
    error?: string;
  }>("/admin/incidents/communicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
  });
  if (!result.success) throw new Error(result.error ?? "Request failed");
  return result.templates;
}

export async function generatePostmortem(input: PostmortemInput): Promise<string> {
  const result = await apiFetch<{ success: boolean; report: string; error?: string }>(
    "/admin/incidents/postmortem",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!result.success) throw new Error(result.error ?? "Request failed");
  return result.report;
}
