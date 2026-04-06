"use client";

import { use, useCallback, useEffect, useState } from "react";

import { ConfigGrid } from "@/components/repo/config-grid";
import { GapChecklist } from "@/components/repo/gap-checklist";
import { getRepoConfig, getRepoGaps, interrogateRepo } from "@/lib/holyship-client";
import type { Gap, RepoConfig } from "@/lib/types";

export default function AnalyzePage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = use(params);

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<RepoConfig | null>(null);
  const [gaps, setGaps] = useState<Gap[]>([]);

  const [analyzing, setAnalyzing] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRepoConfig(owner, repo);
      if (result) {
        setConfig(result.config);
        const repoGaps = await getRepoGaps(owner, repo);
        setGaps(repoGaps);
      } else {
        setConfig(null);
        setGaps([]);
      }
    } catch {
      setConfig(null);
      setGaps([]);
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await interrogateRepo(owner, repo);
      await loadConfig();
    } finally {
      setAnalyzing(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Not analyzed state
  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-5xl mb-4">&#128270;</span>
        <h2 className="text-2xl font-bold mb-2">Analyze this repo</h2>
        <p className="text-muted-foreground max-w-md mb-6">
          Discover what this repo can do, find gaps in its setup, and design an automated shipping flow.
        </p>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={analyzing}
          className="rounded-lg bg-green-600 px-8 py-3 font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {analyzing ? "Analyzing..." : "Analyze Repo"}
        </button>
        <p className="text-amber-400 text-sm mt-4">Stories and Pipeline are unavailable until analysis completes.</p>
      </div>
    );
  }

  // Analyzed state
  return (
    <div className="space-y-6">
      <ConfigGrid config={config} />

      <GapChecklist gaps={gaps} owner={owner} repo={repo} onUpdate={loadConfig} />

      <button
        type="button"
        onClick={handleAnalyze}
        disabled={analyzing}
        className="rounded-lg border border-border px-6 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 disabled:opacity-50"
      >
        {analyzing ? "Re-analyzing..." : "Re-analyze"}
      </button>
    </div>
  );
}
