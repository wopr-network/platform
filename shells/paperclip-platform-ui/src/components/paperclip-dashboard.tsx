"use client";

import { Input } from "@core/components/ui/input";
import type { BotStatusResponse } from "@core/lib/api";
import { mapBotState } from "@core/lib/api";
import { getBrandConfig } from "@core/lib/brand-config";
import { trpc } from "@core/lib/trpc";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { toSubdomainLabel } from "./add-paperclip-card";
import { PaperclipCard, type PaperclipInstance } from "./paperclip-card";

/** Poll interval: fast while provisioning, slow otherwise. */
const POLL_FAST = 3_000;
const POLL_SLOW = 30_000;

/**
 * Tracks instances currently being provisioned.
 * Key = name (subdomain label), value = optimistic instance data.
 */
type ProvisioningMap = Map<string, PaperclipInstance>;

export function PaperclipDashboard() {
  const brand = getBrandConfig();
  const [search, setSearch] = useState("");
  const [provisioning, setProvisioning] = useState<ProvisioningMap>(new Map());
  const toastIdRef = useRef<string | number | undefined>(undefined);

  const hasProvisioning = provisioning.size > 0;

  const {
    data: rawData,
    isLoading,
    error: queryError,
    refetch,
  } = trpc.fleet.listInstances.useQuery(undefined, {
    refetchInterval: hasProvisioning ? POLL_FAST : POLL_SLOW,
  });

  // When server data arrives, reconcile provisioning map
  const serverInstances: PaperclipInstance[] = useMemo(() => {
    const bots = (rawData as { bots?: BotStatusResponse[] } | undefined)?.bots;
    if (!Array.isArray(bots)) return [];
    return bots.map((bot) => {
      const rawStatus = mapBotState(bot.state);
      const status: PaperclipInstance["status"] =
        rawStatus === "running" || rawStatus === "stopped" ? rawStatus : "error";
      return {
        id: bot.id,
        name: bot.name,
        status,
        subdomain: `${toSubdomainLabel(bot.name)}.${brand.domain}`,
      };
    });
  }, [rawData, brand.domain]);

  // Remove from provisioning map once server reports the instance
  useEffect(() => {
    if (provisioning.size === 0) return;
    const next = new Map(provisioning);
    let changed = false;
    for (const [name, _inst] of provisioning) {
      const server = serverInstances.find((s) => toSubdomainLabel(s.name) === name);
      if (server && server.status === "running") {
        next.delete(name);
        changed = true;
        // Dismiss loading toast, show success
        if (toastIdRef.current) {
          toast.success(`${server.name} is ready!`, {
            id: toastIdRef.current,
            duration: 5000,
          });
          toastIdRef.current = undefined;
        }
      }
    }
    if (changed) setProvisioning(next);
  }, [serverInstances, provisioning]);

  // Merge: server instances + provisioning placeholders (deduplicated)
  const instances: PaperclipInstance[] = useMemo(() => {
    const merged = [...serverInstances];
    for (const [name, inst] of provisioning) {
      const exists = serverInstances.some((s) => toSubdomainLabel(s.name) === name);
      if (!exists) merged.push(inst);
    }
    return merged;
  }, [serverInstances, provisioning]);

  const showSearch = instances.length >= 5;

  const filtered = useMemo(() => {
    if (!showSearch || !search) return instances;
    return instances.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  }, [instances, search, showSearch]);

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground/50">
        <Loader2 className="size-5 animate-spin text-indigo-400/60 mr-3" />
        <span className="font-mono text-sm tracking-wide">Loading your Paperclips...</span>
      </div>
    );
  }

  /* --- Error --- */
  if (queryError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="font-mono text-sm text-red-400/80">Failed to load your Paperclips.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="font-mono text-xs text-muted-foreground/50 hover:text-indigo-400 tracking-wide transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const isHero = instances.length === 1;

  function statusSubtitle(): string {
    if (instances.length === 0) return "AWAITING PROVISIONING";
    if (hasProvisioning) return "PROVISIONING IN PROGRESS";
    if (instances.length === 1) {
      const st = instances[0].status.toUpperCase();
      return `YOUR ORGANIZATION IS ${st}`;
    }
    return `${instances.length} ORGANIZATIONS`;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Paperclips</h1>
        <p className="font-mono text-xs text-indigo-400/50 tracking-wide mt-1">{statusSubtitle()}</p>
      </div>

      {/* Search — only at 5+ */}
      {showSearch && (
        <Input
          placeholder="Search Paperclips..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm font-mono text-sm"
        />
      )}

      {/* Hero mode: single centered card + subtle add link */}
      {isHero && (
        <div className="flex flex-col items-center gap-8 py-10">
          <PaperclipCard instance={instances[0]} variant="hero" />
          <Link
            href="/instances/new"
            className="font-mono text-xs text-muted-foreground/50 hover:text-indigo-400 tracking-wide transition-colors duration-200"
          >
            Add another Paperclip
          </Link>
        </div>
      )}

      {/* Grid mode: card grid + add card */}
      {!isHero && instances.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((inst) => (
            <PaperclipCard key={inst.id} instance={inst} variant="grid" />
          ))}
          <Link
            href="/instances/new"
            className="group/add flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/30 p-6 text-muted-foreground/40 hover:border-indigo-500/30 hover:text-indigo-400 hover:bg-indigo-500/[0.02] transition-all duration-300 cursor-pointer min-h-[120px]"
          >
            <Plus className="size-6 transition-transform duration-300 group-hover/add:rotate-90" />
            <span className="font-mono text-xs tracking-wide">Add another Paperclip</span>
          </Link>
        </div>
      )}

      {/* Empty state — walk the user through creating their first Paperclip */}
      {instances.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-6 py-16">
          <div className="text-center">
            <p className="font-mono text-sm text-muted-foreground/60">No Paperclips yet.</p>
            <p className="font-mono text-[10px] tracking-wide text-indigo-400/40 mt-1">
              CREATE YOUR FIRST ORGANIZATION TO GET STARTED
            </p>
          </div>
          <div className="w-full max-w-md">
            <Link
              href="/instances/new"
              className="group/add flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/30 p-6 text-muted-foreground/40 hover:border-indigo-500/30 hover:text-indigo-400 hover:bg-indigo-500/[0.02] transition-all duration-300 cursor-pointer min-h-[120px]"
            >
              <Plus className="size-6 transition-transform duration-300 group-hover/add:rotate-90" />
              <span className="font-mono text-xs tracking-wide">Add another Paperclip</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
