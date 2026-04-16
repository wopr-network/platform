"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

interface Issue {
  number: number;
  title: string;
  labels: { name: string; color: string }[];
  created_at: string;
  html_url: string;
}

export default function RepoIssuesPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = use(params);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [shippingIds, setShippingIds] = useState<Set<number>>(new Set());
  const [shipped, setShipped] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const loadIssues = useCallback(async () => {
    setLoadingIssues(true);
    try {
      const res = await fetch(`/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`);
      const data = await res.json();
      setIssues(data.issues ?? []);
    } catch {
      setIssues([]);
    } finally {
      setLoadingIssues(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  async function shipIssue(issue: Issue) {
    setShippingIds((prev) => new Set(prev).add(issue.number));
    setError(null);
    try {
      const res = await fetch("/api/ship-it", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, issueNumber: issue.number }),
      });
      const data = await res.json();
      if (data.ok || data.entityId) {
        setShipped((prev) => new Map(prev).set(issue.number, data.entityId));
      } else {
        setError(data.error ?? "Ship failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ship failed");
    } finally {
      setShippingIds((prev) => {
        const next = new Set(prev);
        next.delete(issue.number);
        return next;
      });
    }
  }

  const daysAgo = (date: string) => {
    const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  };

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">In Flight</p>
          <p className="mt-1 text-2xl font-bold">{shipped.size}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Open Issues</p>
          <p className="mt-1 text-2xl font-bold">{issues.length}</p>
        </div>
        <div className="rounded-lg border p-4">
          <Link
            href={`/dashboard/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pipeline`}
            className="block hover:text-primary"
          >
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Pipeline</p>
            <p className="mt-1 text-2xl font-bold text-primary">View &rarr;</p>
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 mb-4 text-sm text-red-400">{error}</div>
      )}

      {/* Shipped banner */}
      {shipped.size > 0 && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-green-400">
            {shipped.size} issue{shipped.size !== 1 ? "s" : ""} shipped to the pipeline
          </span>
          <Link
            href={`/dashboard/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pipeline`}
            className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700"
          >
            View Pipeline
          </Link>
        </div>
      )}

      {/* Issue list */}
      {loadingIssues && <p className="text-muted-foreground">Loading issues...</p>}

      {!loadingIssues && issues.length === 0 && <p className="text-muted-foreground">No open issues in this repo.</p>}

      <div className="space-y-2">
        {issues.map((issue) => {
          const isShipping = shippingIds.has(issue.number);
          const isShipped = shipped.has(issue.number);

          return (
            <div
              key={issue.number}
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">#{issue.number}</span>
                  <span className="font-medium truncate">{issue.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {issue.labels.map((label) => (
                    <span
                      key={label.name}
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `#${label.color}20`,
                        color: `#${label.color}`,
                        border: `1px solid #${label.color}40`,
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                  <span className="text-xs text-muted-foreground">{daysAgo(issue.created_at)}</span>
                </div>
              </div>
              {isShipped ? (
                <Link
                  href={`/dashboard/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pipeline`}
                  className="ml-4 rounded-lg bg-green-600 px-5 py-2 text-sm font-bold text-white hover:bg-green-700"
                >
                  View in Pipeline
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => shipIssue(issue)}
                  disabled={isShipping}
                  className="ml-4 rounded-lg px-5 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
                >
                  {isShipping ? "Shipping..." : "Ship It"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
