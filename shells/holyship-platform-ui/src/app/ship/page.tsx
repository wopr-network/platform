"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Repo {
  id: number;
  full_name: string;
  name: string;
}

interface Issue {
  number: number;
  title: string;
  labels: { name: string; color: string }[];
  created_at: string;
  html_url: string;
}

export default function ShipItPage() {
  // Repo picker
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [loadingRepos, setLoadingRepos] = useState(true);

  // Issue list
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [labelFilter, setLabelFilter] = useState("");

  // Shipping state
  const [shippingIds, setShippingIds] = useState<Set<number>>(new Set());
  const [shipped, setShipped] = useState<Map<number, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Auto-ship
  const [autoShipLabel, setAutoShipLabel] = useState("");
  const [autoShipEnabled, setAutoShipEnabled] = useState(false);

  // Fallback URL input
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [issueUrl, setIssueUrl] = useState("");

  // Load repos on mount
  useEffect(() => {
    fetch("/api/github/repos")
      .then((r) => r.json())
      .then((data) => {
        setRepos(data.repositories ?? []);
        setLoadingRepos(false);
      })
      .catch(() => setLoadingRepos(false));
  }, []);

  // Load issues when repo changes
  const loadIssues = useCallback(async (repoFullName: string) => {
    if (!repoFullName) return;
    setLoadingIssues(true);
    try {
      const [rfOwner, rfRepo] = repoFullName.split("/");
      const res = await fetch(
        `/api/github/repos/${encodeURIComponent(rfOwner)}/${encodeURIComponent(rfRepo)}/issues`,
      );
      const data = await res.json();
      setIssues(data.issues ?? []);
    } catch {
      setIssues([]);
    } finally {
      setLoadingIssues(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRepo) loadIssues(selectedRepo);
  }, [selectedRepo, loadIssues]);

  // Ship a single issue
  async function shipIssue(issue: Issue) {
    const [owner, repo] = selectedRepo.split("/");
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

  // Ship by URL (fallback)
  async function shipByUrl() {
    if (!issueUrl.trim()) return;
    setShippingIds((prev) => new Set(prev).add(-1));
    setError(null);
    try {
      const res = await fetch("/api/ship-it", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueUrl }),
      });
      const data = await res.json();
      if (data.ok || data.entityId) {
        setIssueUrl("");
        setShipped((prev) => new Map(prev).set(-1, data.entityId));
      } else {
        setError(data.error ?? "Ship failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ship failed");
    } finally {
      setShippingIds((prev) => {
        const next = new Set(prev);
        next.delete(-1);
        return next;
      });
    }
  }

  // Toggle auto-ship
  async function toggleAutoShip() {
    if (!selectedRepo || !autoShipLabel) return;
    const newState = !autoShipEnabled;
    await fetch("/api/github/auto-ship", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: selectedRepo,
        label: autoShipLabel,
        enabled: newState,
      }),
    });
    setAutoShipEnabled(newState);
  }

  const filteredIssues = labelFilter
    ? issues.filter((i) => i.labels.some((l) => l.name.toLowerCase().includes(labelFilter.toLowerCase())))
    : issues;

  const daysAgo = (date: string) => {
    const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Ship It</h1>
          <p className="text-muted-foreground">Pick issues. We ship them. They work.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {showUrlInput ? "Hide URL input" : "Paste URL instead"}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 mb-6 text-sm text-red-400">{error}</div>
      )}

      {/* Shipped banner */}
      {shipped.size > 0 && (
        <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-3 mb-6 flex items-center justify-between">
          <span className="text-sm text-green-400">
            {shipped.size} issue{shipped.size !== 1 ? "s" : ""} shipped to the pipeline
          </span>
          {selectedRepo && (
            <Link
              href={`/dashboard/${encodeURIComponent(selectedRepo.split("/")[0])}/${encodeURIComponent(selectedRepo.split("/")[1])}/pipeline`}
              className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              View Pipeline
            </Link>
          )}
        </div>
      )}

      {/* Fallback URL input */}
      {showUrlInput && (
        <div className="flex gap-3 mb-6">
          <input
            type="url"
            placeholder="https://github.com/org/repo/issues/123"
            value={issueUrl}
            onChange={(e) => setIssueUrl(e.target.value)}
            className="flex-1 rounded-lg border bg-background px-4 py-3"
            disabled={shippingIds.has(-1)}
          />
          <button
            type="button"
            onClick={shipByUrl}
            disabled={shippingIds.has(-1) || !issueUrl.trim()}
            className="rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {shippingIds.has(-1) ? "Shipping..." : "Ship It"}
          </button>
        </div>
      )}

      {/* Repo picker */}
      <div className="mb-6">
        {loadingRepos ? (
          <p className="text-muted-foreground">Loading repos...</p>
        ) : repos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-lg font-medium mb-2">No repos connected</p>
            <p className="text-muted-foreground mb-4">Install the Holy Ship GitHub App to get started.</p>
            <a href="/connect" className="rounded-lg bg-primary px-6 py-3 font-bold text-primary-foreground">
              Connect GitHub
            </a>
          </div>
        ) : (
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="w-full rounded-lg border bg-background px-4 py-3 text-lg"
          >
            <option value="">Select a repo...</option>
            {repos.map((r) => (
              <option key={r.id} value={r.full_name}>
                {r.full_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Auto-ship toggle */}
      {selectedRepo && (
        <div className="flex items-center gap-3 mb-6 p-4 rounded-lg border bg-muted/50">
          <span className="text-sm font-medium">Auto-ship issues with label:</span>
          <input
            type="text"
            placeholder="holyship"
            value={autoShipLabel}
            onChange={(e) => setAutoShipLabel(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm w-40"
          />
          <button
            type="button"
            onClick={toggleAutoShip}
            disabled={!autoShipLabel}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${
              autoShipEnabled
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-muted text-foreground hover:bg-muted/80"
            } disabled:opacity-50`}
          >
            {autoShipEnabled ? "Auto-shipping" : "Enable"}
          </button>
        </div>
      )}

      {/* Label filter */}
      {selectedRepo && issues.length > 0 && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Filter by label..."
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm w-64"
          />
        </div>
      )}

      {/* Issue list */}
      {loadingIssues && <p className="text-muted-foreground">Loading issues...</p>}

      {selectedRepo && !loadingIssues && filteredIssues.length === 0 && (
        <p className="text-muted-foreground">No open issues in this repo.</p>
      )}

      <div className="space-y-2">
        {filteredIssues.map((issue) => {
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
                  href={`/dashboard/${encodeURIComponent(selectedRepo.split("/")[0])}/${encodeURIComponent(selectedRepo.split("/")[1])}/pipeline`}
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
