"use client";

import { Input } from "@core/components/ui/input";
import type { BotStatusResponse } from "@core/lib/api";
import { mapBotState } from "@core/lib/api";
import { getBrandConfig } from "@core/lib/brand-config";
import { toUserMessage } from "@core/lib/errors";
import { trpc } from "@core/lib/trpc";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddPaperclipCard, toSubdomainLabel } from "./add-paperclip-card";
import { PaperclipCard, type PaperclipInstance } from "./paperclip-card";

/** Paperclip uses a single default provider — no user-facing selection. */
const PAPERCLIP_PROVIDER = "default";

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

  const createMutation = trpc.fleet.createInstance.useMutation({
    onSuccess: () => {
      // Server responded — container spawned. Fast-polling will pick up
      // the health transition. Update toast to provisioning phase.
      if (toastIdRef.current) {
        toast.loading("Booting up — running migrations...", {
          id: toastIdRef.current,
        });
      }
      refetch();
    },
    onError: (err: unknown) => {
      // Remove from provisioning map
      setProvisioning((prev) => {
        const next = new Map(prev);
        // Remove the last added entry
        const keys = Array.from(next.keys());
        if (keys.length > 0) next.delete(keys[keys.length - 1]);
        return next;
      });
      if (toastIdRef.current) {
        toast.error(toUserMessage(err, "Failed to create Paperclip"), {
          id: toastIdRef.current,
          duration: 8000,
        });
        toastIdRef.current = undefined;
      }
    },
  });

  const handleAdd = useCallback(
    (name: string) => {
      // name arrives pre-sanitized from AddPaperclipCard (subdomain label)
      const label = name;

      // Optimistic: add provisioning card immediately
      const optimistic: PaperclipInstance = {
        id: `provisioning-${label}`,
        name: label,
        status: "provisioning",
        subdomain: `${label}.${brand.domain}`,
      };
      setProvisioning((prev) => new Map(prev).set(label, optimistic));

      // Persistent loading toast
      toastIdRef.current = toast.loading(`Creating ${label}...`);

      createMutation.mutate({
        name: label,
        provider: PAPERCLIP_PROVIDER,
        channels: [],
        plugins: [],
      });
    },
    [brand.domain, createMutation],
  );

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

  // AddPaperclipCard only shows "Creating..." during the HTTP request.
  // Once the server responds, the provisioning card takes over.
  const isAdding = createMutation.isPending;

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
          <AddPaperclipCard onAdd={handleAdd} adding={isAdding} variant="link" />
        </div>
      )}

      {/* Grid mode: card grid + add card */}
      {!isHero && instances.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((inst) => (
            <PaperclipCard key={inst.id} instance={inst} variant="grid" />
          ))}
          <AddPaperclipCard onAdd={handleAdd} adding={isAdding} variant="card" />
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
            <AddPaperclipCard onAdd={handleAdd} adding={isAdding} variant="card" />
          </div>
        </div>
      )}
    </div>
  );
}
