import type {
  AuditCategory,
  AuditResult,
  CreatedIssue,
  DesignedFlow,
  FlowApplyResponse,
  FlowEditResponse,
  FlowResponse,
  Gap,
  RepoConfig,
} from "./types";

const BASE = "/api";
const TIMEOUT = 30_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(TIMEOUT),
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Interrogation ───

export function interrogateRepo(owner: string, repo: string) {
  return request<{
    repoConfigId: string;
    repo: string;
    description: string;
    languages: string[];
    gapCount: number;
    gaps: { capability: string; title: string; priority: string }[];
    hasClaudeMd: boolean;
  }>(`/repos/${owner}/${repo}/interrogate`, { method: "POST" });
}

export async function getRepoConfig(owner: string, repo: string) {
  try {
    return await request<{
      id: string;
      config: RepoConfig;
      claudeMd: string | null;
    }>(`/repos/${owner}/${repo}/config`);
  } catch {
    return null;
  }
}

export async function getRepoGaps(owner: string, repo: string) {
  const r = await request<{ repo: string; gaps: Gap[] }>(`/repos/${owner}/${repo}/gaps`);
  return r.gaps;
}

// ─── Gap Actualization ───

export function createIssueFromGap(owner: string, repo: string, gapId: string, createEntity = false) {
  return request<CreatedIssue>(`/repos/${owner}/${repo}/gaps/${gapId}/create-issue`, {
    method: "POST",
    body: JSON.stringify({ create_entity: createEntity }),
  });
}

export function createAllIssues(owner: string, repo: string, createEntity = false) {
  return request<{ repo: string; created: number; issues: CreatedIssue[] }>(`/repos/${owner}/${repo}/gaps/create-all`, {
    method: "POST",
    body: JSON.stringify({ create_entity: createEntity }),
  });
}

// ─── Audit ───

export function runAudit(owner: string, repo: string, categories: AuditCategory[], customInstructions?: string) {
  return request<AuditResult>(`/repos/${owner}/${repo}/audit`, {
    method: "POST",
    body: JSON.stringify({
      categories,
      custom_instructions: customInstructions,
    }),
  });
}

// ─── Flow Design ───

export function designFlow(owner: string, repo: string) {
  return request<DesignedFlow>(`/repos/${owner}/${repo}/design-flow`, {
    method: "POST",
  });
}

// ─── Flow Editor ───

export async function getFlow(owner: string, repo: string) {
  try {
    return await request<FlowResponse>(`/repos/${owner}/${repo}/flow`);
  } catch {
    return null;
  }
}

export function editFlow(owner: string, repo: string, message: string, currentYaml: string) {
  return request<FlowEditResponse>(`/repos/${owner}/${repo}/flow/edit`, {
    method: "POST",
    body: JSON.stringify({ message, currentYaml }),
    signal: AbortSignal.timeout(60_000),
  });
}

export function applyFlow(owner: string, repo: string, yaml: string, commitMessage: string, baseSha: string) {
  return request<FlowApplyResponse>(`/repos/${owner}/${repo}/flow/apply`, {
    method: "POST",
    body: JSON.stringify({ yaml, commitMessage, baseSha }),
  });
}

// ─── Engine Pipeline ───

export interface PipelineEntity {
  id: string;
  flowId: string;
  flowVersion: number;
  state: string;
  artifacts: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface EngineStatus {
  flows: Record<string, Record<string, number>>;
  activeInvocations: number;
  pendingClaims: number;
}

export async function listEntities(flowId?: string, state?: string, limit = 50) {
  const params = new URLSearchParams();
  if (flowId) params.set("flowId", flowId);
  if (state) params.set("state", state);
  params.set("limit", String(limit));
  return request<PipelineEntity[]>(`/engine/entities?${params}`);
}

export async function getEntity(entityId: string) {
  return request<PipelineEntity>(`/engine/entities/${entityId}`);
}

export async function getEngineStatus() {
  return request<EngineStatus>(`/engine/status`);
}

export interface EntityInvocation {
  id: string;
  stage: string;
  agentRole: string | null;
  signal: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  artifactKeys: string[];
}

export interface EntityDetail {
  entity: PipelineEntity;
  invocations: EntityInvocation[];
}

export async function getEntityDetail(entityId: string) {
  return request<EntityDetail>(`/engine/entities/${entityId}/detail`);
}
