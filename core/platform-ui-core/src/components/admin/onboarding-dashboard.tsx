"use client";

import {
  BookOpen,
  CheckCircle2,
  Clock,
  Edit2,
  Plus,
  Save,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { OnboardingFunnelStats, OnboardingScript } from "@/lib/admin-api";
import {
  getOnboardingFunnelStats,
  getOnboardingScripts,
  saveOnboardingScript,
} from "@/lib/admin-api";
import { toUserMessage } from "@/lib/errors";

// ---- Utilities ----

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

// ---- Stat card ----

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ---- Funnel view ----

function FunnelView({ stats }: { stats: OnboardingFunnelStats }) {
  const maxStarted = stats.steps[0]?.started ?? 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Total Started" value={stats.total_started.toLocaleString()} />
        <StatCard
          icon={CheckCircle2}
          label="Total Completed"
          value={stats.total_completed.toLocaleString()}
          sub={fmtPct(stats.overall_completion_rate)}
        />
        <StatCard
          icon={TrendingUp}
          label="Completion Rate"
          value={fmtPct(stats.overall_completion_rate)}
        />
        <StatCard
          icon={Clock}
          label="Time to First Bot"
          value={fmtMs(stats.time_to_first_bot_ms)}
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left">
              <th className="px-4 py-2.5 font-medium text-muted-foreground">Step</th>
              <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Started</th>
              <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">
                Completed
              </th>
              <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Dropped</th>
              <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">Rate</th>
              <th className="px-4 py-2.5 font-medium text-muted-foreground text-right">
                Avg Duration
              </th>
              <th className="px-4 py-2.5 font-medium text-muted-foreground">Funnel</th>
            </tr>
          </thead>
          <tbody>
            {stats.steps.map((step, idx) => {
              const pct = Math.round((step.started / maxStarted) * 100);
              const dropPct =
                idx > 0 && stats.steps[idx - 1]
                  ? Math.round((step.dropped / (stats.steps[idx - 1]?.started ?? 1)) * 100)
                  : 0;

              return (
                <tr
                  key={step.step}
                  className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{step.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {step.started.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-green-400">
                    {step.completed.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-red-400">
                    {step.dropped.toLocaleString()}
                    {idx > 0 && dropPct > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">({dropPct}%)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <Badge
                      variant="secondary"
                      className={
                        step.completion_rate >= 0.7
                          ? "bg-green-500/15 text-green-400 border-green-500/20"
                          : step.completion_rate >= 0.4
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                            : "bg-red-500/15 text-red-400 border-red-500/20"
                      }
                    >
                      {fmtPct(step.completion_rate)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {fmtMs(step.avg_duration_ms)}
                  </td>
                  <td className="px-4 py-3 w-32">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-terminal/70 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Script editor ----

interface ScriptEditorProps {
  scripts: OnboardingScript[];
  onSaved: (s: OnboardingScript) => void;
}

function ScriptEditor({ scripts, onSaved }: ScriptEditorProps) {
  const [selected, setSelected] = useState<OnboardingScript | null>(scripts[0] ?? null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(script: OnboardingScript | null) {
    if (script) {
      setSelected(script);
      setName(script.name);
      setContent(script.content);
    } else {
      setSelected(null);
      setName("");
      setContent("");
    }
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    if (scripts[0]) {
      setSelected(scripts[0]);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Script name is required.");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveOnboardingScript(
        editing && selected ? selected.id : null,
        name.trim(),
        content,
      );
      onSaved(saved);
      setEditing(false);
      setSelected(saved);
      toast.success("Script saved.");
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{selected ? "Edit Script" : "New Script"}</h3>
          <Button size="sm" variant="ghost" onClick={cancelEdit}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Input placeholder="Script name" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea
          placeholder="Script content (Markdown supported)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          className="font-mono text-xs"
        />
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Onboarding Scripts</h3>
        <Button size="sm" variant="outline" onClick={() => startEdit(null)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Script
        </Button>
      </div>
      {scripts.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">No scripts yet.</p>
      )}
      <div className="space-y-2">
        {scripts.map((s) => (
          <button
            key={s.id}
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/20 transition-colors text-left"
            onClick={() => setSelected(s)}
          >
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{s.name}</span>
                {s.active && (
                  <Badge
                    variant="secondary"
                    className="bg-green-500/15 text-green-400 border-green-500/20 text-xs"
                  >
                    active
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                v{s.version} · updated {new Date(s.updated_at).toLocaleDateString()}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                startEdit(s);
              }}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
          </button>
        ))}
      </div>
      {selected && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 mt-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-2">{selected.name}</h4>
          <pre className="text-xs whitespace-pre-wrap font-mono text-foreground/80 max-h-64 overflow-y-auto">
            {selected.content || "(empty)"}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---- Main dashboard ----

export function OnboardingDashboard() {
  const [stats, setStats] = useState<OnboardingFunnelStats | null>(null);
  const [scripts, setScripts] = useState<OnboardingScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [funnelStats, scriptList] = await Promise.all([
        getOnboardingFunnelStats(days),
        getOnboardingScripts(),
      ]);
      setStats(funnelStats);
      setScripts(scriptList);
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  function handleScriptSaved(s: OnboardingScript) {
    setScripts((prev) => {
      const idx = prev.findIndex((x) => x.id === s.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = s;
        return next;
      }
      return [s, ...prev];
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Onboarding</h1>
          <p className="text-muted-foreground text-sm">Funnel analytics and onboarding scripts</p>
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "secondary" : "outline"}
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="funnel">
        <TabsList>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
        </TabsList>

        <TabsContent value="funnel" className="mt-4">
          {loading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }, (_, i) => `sk-stat-${i}`).map((k) => (
                  <Skeleton key={k} className="h-20 rounded-lg" />
                ))}
              </div>
              <Skeleton className="h-48 rounded-lg" />
            </div>
          ) : stats ? (
            <FunnelView stats={stats} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No data available.</p>
          )}
        </TabsContent>

        <TabsContent value="scripts" className="mt-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, i) => `sk-script-${i}`).map((k) => (
                <Skeleton key={k} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : (
            <ScriptEditor scripts={scripts} onSaved={handleScriptSaved} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
