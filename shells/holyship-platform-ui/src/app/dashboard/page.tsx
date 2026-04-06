"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RepoCard } from "@/components/repo/repo-card";
import { getRepoConfig } from "@/lib/holyship-client";
import type { RepoSummary } from "@/lib/types";

export default function DashboardPage() {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  async function syncInstallations() {
    setSyncing(true);
    try {
      await fetch("/api/github/sync-installations", { method: "POST", credentials: "include" });
      setLoadKey((k) => k + 1);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/github/repos");
        const data = await res.json();
        const raw: { id: number; full_name: string; name: string }[] = data.repositories ?? [];

        const enriched = await Promise.all(
          raw.map(async (r) => {
            const [owner, repo] = r.full_name.split("/");
            const configResult = await getRepoConfig(owner, repo);
            const analyzed = configResult !== null;
            return {
              id: r.id,
              full_name: r.full_name,
              name: r.name,
              analyzed,
              config: configResult?.config ?? null,
              inFlight: 0,
              shippedToday: 0,
              openGaps: 0,
            } satisfies RepoSummary;
          }),
        );

        if (!cancelled) {
          setRepos(enriched);
        }
      } catch {
        // leave repos empty
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Your Repos</h1>
        <p className="text-muted-foreground">Loading repos...</p>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Your Repos</h1>
        <div className="rounded-lg border-2 border-dashed border-primary/40 p-10 text-center">
          <h2 className="text-2xl font-bold mb-2">No repos connected</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Install the Holy Ship GitHub App to start shipping issues automatically.
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="/connect"
              className="inline-block rounded-lg bg-primary px-8 py-3 font-bold text-primary-foreground hover:bg-primary/90 transition-opacity"
            >
              Connect GitHub
            </a>
            <button
              type="button"
              onClick={syncInstallations}
              disabled={syncing}
              className="rounded-lg border border-border px-6 py-3 font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Refresh"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Your Repos</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={syncInstallations}
            disabled={syncing}
            className="rounded-lg border border-border px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Refresh"}
          </button>
          <Link
            href="/connect"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-opacity"
          >
            + Connect Repo
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {repos.map((repo) => (
          <RepoCard key={repo.id} repo={repo} />
        ))}

        <Link
          href="/connect"
          className="flex items-center justify-center rounded-xl border-2 border-dashed border-border p-8 text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
        >
          <span className="text-3xl font-light">+</span>
        </Link>
      </div>
    </div>
  );
}
