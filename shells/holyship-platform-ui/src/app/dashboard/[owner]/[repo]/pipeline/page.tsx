"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type EngineStatus, getEngineStatus, listEntities, type PipelineEntity } from "@/lib/holyship-client";

const STATE_ORDER = ["spec", "code", "review", "fix", "docs", "merge"];
const TERMINAL_STATES = new Set(["done", "stuck", "cancelled", "budget_exceeded"]);

const STATE_COLORS: Record<string, string> = {
  spec: "border-sky-500/40 bg-sky-500/5",
  code: "border-violet-500/40 bg-violet-500/5",
  review: "border-amber-500/40 bg-amber-500/5",
  fix: "border-orange-500/40 bg-orange-500/5",
  docs: "border-teal-500/40 bg-teal-500/5",
  merge: "border-green-500/40 bg-green-500/5",
  done: "border-green-600/40 bg-green-600/5",
  stuck: "border-red-500/40 bg-red-500/5",
  cancelled: "border-zinc-500/40 bg-zinc-500/5",
  budget_exceeded: "border-red-500/40 bg-red-500/5",
};

const STATE_DOT: Record<string, string> = {
  spec: "bg-sky-500",
  code: "bg-violet-500",
  review: "bg-amber-500",
  fix: "bg-orange-500",
  docs: "bg-teal-500",
  merge: "bg-green-500",
  done: "bg-green-600",
  stuck: "bg-red-500",
  cancelled: "bg-zinc-500",
  budget_exceeded: "bg-red-500",
};

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function EntityCard({ entity, owner, repo }: { entity: PipelineEntity; owner: string; repo: string }) {
  const a = entity.artifacts ?? {};
  const issueTitle = (a.issueTitle as string) ?? "Untitled";
  const issueNumber = a.issueNumber as number | undefined;
  const prUrl = a.prUrl as string | undefined;
  const prNumber = a.prNumber as number | undefined;
  const repoFullName = a.repoFullName as string | undefined;
  const hasSpec = !!a.architectSpec;
  const hasFindings = !!a.reviewFindings;

  return (
    <Link
      href={`/dashboard/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pipeline/${entity.id}`}
      className={`block rounded-lg border p-3 hover:ring-1 hover:ring-foreground/20 transition-all ${STATE_COLORS[entity.state] ?? "border-border"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {issueNumber && <span className="text-xs text-muted-foreground font-mono">#{issueNumber}</span>}
            <span className="text-sm font-medium truncate">{issueTitle}</span>
          </div>
          {repoFullName && <span className="text-xs text-muted-foreground">{repoFullName}</span>}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(entity.updatedAt)}</span>
      </div>

      {/* Artifact badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {hasSpec && (
          <span className="rounded-full bg-sky-500/10 text-sky-400 px-2 py-0.5 text-[10px] font-medium">spec</span>
        )}
        {prUrl && prNumber && (
          <span className="rounded-full bg-violet-500/10 text-violet-400 px-2 py-0.5 text-[10px] font-medium">
            PR #{prNumber}
          </span>
        )}
        {hasFindings && (
          <span className="rounded-full bg-amber-500/10 text-amber-400 px-2 py-0.5 text-[10px] font-medium">
            findings
          </span>
        )}
      </div>
    </Link>
  );
}

function StateLane({
  state,
  entities,
  owner,
  repo,
}: {
  state: string;
  entities: PipelineEntity[];
  owner: string;
  repo: string;
}) {
  return (
    <div className="flex-1 min-w-[180px]">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${STATE_DOT[state] ?? "bg-zinc-500"}`} />
        <span className="text-sm font-semibold capitalize">{state}</span>
        {entities.length > 0 && <span className="text-xs text-muted-foreground">({entities.length})</span>}
      </div>
      <div className="space-y-2 min-h-[60px]">
        {entities.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/50 p-4 text-center">
            <span className="text-xs text-muted-foreground">Empty</span>
          </div>
        )}
        {entities.map((e) => (
          <EntityCard key={e.id} entity={e} owner={owner} repo={repo} />
        ))}
      </div>
    </div>
  );
}

export default function PipelineLivePage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [entities, setEntities] = useState<PipelineEntity[]>([]);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const repoFullName = `${owner}/${repo}`;

    async function poll() {
      try {
        const [entityList, engineStatus] = await Promise.all([
          listEntities().catch(() => [] as PipelineEntity[]),
          getEngineStatus().catch(() => null),
        ]);
        if (!active) return;
        // Filter entities to this repo (artifacts.repoFullName)
        const repoEntities = entityList.filter((e) => {
          const rn = e.artifacts?.repoFullName;
          return rn === repoFullName;
        });
        setEntities(repoEntities);
        setStatus(engineStatus);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [owner, repo]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted/50 rounded w-48" />
          <div className="flex gap-4">
            {STATE_ORDER.map((s) => (
              <div key={s} className="flex-1 h-32 bg-muted/30 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const activeEntities = entities.filter((e) => !TERMINAL_STATES.has(e.state));
  const terminalEntities = entities.filter((e) => TERMINAL_STATES.has(e.state));

  const byState: Record<string, PipelineEntity[]> = {};
  for (const state of STATE_ORDER) {
    byState[state] = activeEntities.filter((e) => e.state === state);
  }

  const isEmpty = entities.length === 0;

  return (
    <div className="p-6 space-y-6">
      {/* Status bar */}
      {status && (
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-muted-foreground">
              {status.activeInvocations} active worker
              {status.activeInvocations !== 1 ? "s" : ""}
            </span>
          </div>
          <span className="text-muted-foreground">{activeEntities.length} in pipeline</span>
          <span className="text-muted-foreground">{terminalEntities.length} completed</span>
          {error && <span className="text-red-400 text-xs">{error}</span>}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-lg font-medium mb-2">No entities in the pipeline</p>
          <p className="text-muted-foreground mb-4">Ship an issue to get started.</p>
          <Link
            href={`/dashboard/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}
            className="rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground"
          >
            Ship an Issue
          </Link>
        </div>
      )}

      {/* Swim lanes */}
      {!isEmpty && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATE_ORDER.map((state) => (
            <StateLane key={state} state={state} entities={byState[state] ?? []} owner={owner} repo={repo} />
          ))}
        </div>
      )}

      {/* Terminal entities */}
      {terminalEntities.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {terminalEntities.length} completed entit
            {terminalEntities.length === 1 ? "y" : "ies"}
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {terminalEntities.map((e) => (
              <EntityCard key={e.id} entity={e} owner={owner} repo={repo} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
