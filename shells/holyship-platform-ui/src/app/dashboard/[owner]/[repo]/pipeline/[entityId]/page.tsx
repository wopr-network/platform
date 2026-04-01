"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type EntityDetail, getEntityDetail } from "@/lib/holyship-client";

const STATE_COLORS: Record<string, string> = {
  spec: "text-sky-400",
  code: "text-violet-400",
  review: "text-amber-400",
  fix: "text-orange-400",
  docs: "text-teal-400",
  merge: "text-green-400",
  done: "text-green-600",
  stuck: "text-red-400",
  cancelled: "text-zinc-400",
  budget_exceeded: "text-red-400",
};

const STATE_BG: Record<string, string> = {
  spec: "bg-sky-500/10",
  code: "bg-violet-500/10",
  review: "bg-amber-500/10",
  fix: "bg-orange-500/10",
  docs: "bg-teal-500/10",
  merge: "bg-green-500/10",
  done: "bg-green-600/10",
  stuck: "bg-red-500/10",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "-";
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function duration(start: string | null, end: string | null): string {
  if (!start) return "-";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.floor((e - s) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export default function EntityDetailPage() {
  const { owner, repo, entityId } = useParams<{
    owner: string;
    repo: string;
    entityId: string;
  }>();
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const d = await getEntityDetail(entityId);
        if (active) {
          setDetail(d);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [entityId]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="animate-pulse h-8 bg-muted/50 rounded w-64" />
        <div className="animate-pulse h-48 bg-muted/30 rounded-lg" />
        <div className="animate-pulse h-64 bg-muted/30 rounded-lg" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="p-6">
        <p className="text-red-400">{error ?? "Entity not found"}</p>
        <Link
          href={`/dashboard/${owner}/${repo}/pipeline`}
          className="text-sm text-muted-foreground hover:text-foreground mt-2 inline-block"
        >
          &larr; Back to pipeline
        </Link>
      </div>
    );
  }

  const { entity, invocations } = detail;
  const a = entity.artifacts ?? {};
  const issueTitle = (a.issueTitle as string) ?? "Untitled";
  const issueNumber = a.issueNumber as number | undefined;
  const issueUrl = a.issueUrl as string | undefined;
  const prUrl = a.prUrl as string | undefined;
  const prNumber = a.prNumber as number | undefined;
  const architectSpec = a.architectSpec as string | undefined;
  const reviewFindings = a.reviewFindings as string | undefined;
  const repoFullName = (a.repoFullName as string) ?? "";

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/dashboard/${owner}/${repo}/pipeline`} className="hover:text-foreground">
          Pipeline
        </Link>
        <span>/</span>
        <span className="text-foreground">{issueNumber ? `#${issueNumber}` : entity.id.slice(0, 8)}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{issueTitle}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {repoFullName && <span>{repoFullName}</span>}
            {issueNumber && issueUrl && (
              <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                Issue #{issueNumber} &nearr;
              </a>
            )}
            {prUrl && prNumber && (
              <a href={prUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                PR #{prNumber} &nearr;
              </a>
            )}
          </div>
        </div>
        <span
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${STATE_BG[entity.state] ?? "bg-zinc-500/10"} ${STATE_COLORS[entity.state] ?? "text-zinc-400"}`}
        >
          {entity.state}
        </span>
      </div>

      {/* Artifacts */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Artifacts</h2>
        {Object.keys(a).length === 0 && <p className="text-sm text-muted-foreground">No artifacts yet</p>}

        <div className="grid grid-cols-2 gap-3 text-sm">
          {Object.entries(a).map(([key, value]) => {
            const isLong = typeof value === "string" && value.length > 100;
            const display =
              typeof value === "string" ? (isLong ? `${value.slice(0, 100)}...` : value) : JSON.stringify(value);
            return (
              <div key={key} className="rounded-md bg-muted/30 p-2">
                <span className="text-xs text-muted-foreground font-mono">{key}</span>
                <p className="text-foreground mt-0.5 break-all">{display}</p>
              </div>
            );
          })}
        </div>

        {/* Expandable spec */}
        {architectSpec && (
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              View full architect spec
            </summary>
            <pre className="mt-2 text-xs bg-muted/20 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {architectSpec}
            </pre>
          </details>
        )}

        {/* Expandable findings */}
        {reviewFindings && (
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              View review findings
            </summary>
            <pre className="mt-2 text-xs bg-muted/20 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
              {reviewFindings}
            </pre>
          </details>
        )}
      </div>

      {/* Invocation Timeline */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Activity</h2>
        {invocations.length === 0 && <p className="text-sm text-muted-foreground">No invocations yet</p>}

        <div className="space-y-1">
          {invocations.map((inv) => {
            const isRunning = inv.startedAt && !inv.completedAt && !inv.failedAt;
            const isFailed = !!inv.failedAt || !!inv.error;
            const statusColor = isFailed ? "text-red-400" : isRunning ? "text-amber-400" : "text-green-400";
            const statusDot = isFailed ? "bg-red-500" : isRunning ? "bg-amber-500 animate-pulse" : "bg-green-500";

            return (
              <div key={inv.id} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium capitalize ${STATE_COLORS[inv.stage] ?? "text-foreground"}`}>
                      {inv.stage}
                    </span>
                    {inv.agentRole && <span className="text-xs text-muted-foreground">({inv.agentRole})</span>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {duration(inv.startedAt, inv.completedAt ?? inv.failedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {inv.signal && <span className={`text-xs ${statusColor}`}>signal: {inv.signal}</span>}
                    {inv.error && <span className="text-xs text-red-400 truncate">{inv.error}</span>}
                    {isRunning && <span className="text-xs text-amber-400">running {timeAgo(inv.startedAt)}</span>}
                  </div>
                  {inv.artifactKeys.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {inv.artifactKeys.map((k) => (
                        <span
                          key={k}
                          className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Entity: <span className="font-mono">{entity.id}</span>
        </p>
        <p>
          Flow: {entity.flowId} v{entity.flowVersion}
        </p>
        <p>Created: {new Date(entity.createdAt).toLocaleString()}</p>
        <p>Updated: {timeAgo(entity.updatedAt)}</p>
      </div>
    </div>
  );
}
