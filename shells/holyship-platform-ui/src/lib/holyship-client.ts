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
/** Direct API URL for long-running requests (bypasses Next.js rewrite proxy timeout). */
const DIRECT_BASE =
  typeof window !== "undefined" ? `${window.location.protocol}//api.${window.location.hostname}/api` : BASE;
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

/** Like request() but calls the API directly (not through Next.js rewrite). Use for long-running calls. */
async function directRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${DIRECT_BASE}${path}`, {
    ...init,
    credentials: "include",
    signal: init?.signal ?? AbortSignal.timeout(300_000),
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
  return directRequest<{
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
  return directRequest<DesignedFlow>(`/repos/${owner}/${repo}/design-flow`, { method: "POST" });
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
  return directRequest<FlowEditResponse>(`/repos/${owner}/${repo}/flow/edit`, {
    method: "POST",
    body: JSON.stringify({ message, currentYaml }),
  });
}

export interface StreamEditDoneEvent {
  type: "done";
  yaml: string;
  flow: DesignedFlow;
  explanation: string;
  diff: string[];
}

/**
 * Streaming flow edit. Calls onChunk with text fragments as the AI generates
 * its response, then calls onDone with the final parsed result.
 */
export async function editFlowStreaming(
  owner: string,
  repo: string,
  message: string,
  currentYaml: string,
  onChunk: (text: string) => void,
): Promise<StreamEditDoneEvent> {
  const res = await fetch(`${DIRECT_BASE}/repos/${owner}/${repo}/flow/edit/stream`, {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(300_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, currentYaml }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }

  return consumeSSEStream<StreamEditDoneEvent>(res, onChunk);
}

/**
 * Streaming flow design. Calls onChunk with text fragments as the AI generates
 * its response, then returns the final designed flow.
 */
export async function designFlowStreaming(
  owner: string,
  repo: string,
  onChunk: (text: string) => void,
): Promise<DesignedFlow> {
  const res = await fetch(`${DIRECT_BASE}/repos/${owner}/${repo}/design-flow/stream`, {
    method: "POST",
    credentials: "include",
    signal: AbortSignal.timeout(300_000),
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }

  return consumeSSEStream<DesignedFlow>(res, onChunk);
}

/** Parse an SSE stream, calling onChunk for text events and returning the done payload. */
async function consumeSSEStream<T>(res: Response, onChunk: (text: string) => void): Promise<T> {
  if (!res.body) {
    throw new Error("No response body for streaming request");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed?.startsWith("data: ")) continue;

      const payload = trimmed.slice("data: ".length);
      if (payload === "[DONE]") continue;

      try {
        const event = JSON.parse(payload) as { type: string; content?: string; message?: string };
        if (event.type === "text" && event.content) {
          onChunk(event.content);
        } else if (event.type === "done") {
          result = event as unknown as T;
        } else if (event.type === "error") {
          throw new Error(event.message ?? "Stream error");
        }
      } catch (err) {
        if (err instanceof Error && err.message !== "Stream error" && !err.message.startsWith("Flow")) {
          // JSON parse error — skip malformed chunk
          continue;
        }
        throw err;
      }
    }
  }

  if (!result) {
    throw new Error("Stream ended without a done event");
  }

  return result;
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

// ─── Ship It ───

export interface ShipItResponse {
  ok: boolean;
  entityId: string;
  state: string;
}

export async function shipIssue(owner: string, repo: string, issueNumber: number, flow?: string) {
  return request<ShipItResponse>("/ship-it", {
    method: "POST",
    body: JSON.stringify({ owner, repo, issueNumber, ...(flow ? { flow } : {}) }),
  });
}

export async function shipIssueByUrl(issueUrl: string, flow?: string) {
  return request<ShipItResponse>("/ship-it", {
    method: "POST",
    body: JSON.stringify({ issueUrl, ...(flow ? { flow } : {}) }),
  });
}
