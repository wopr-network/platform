"use client";

import { ChatPanel } from "@core/components/chat/chat-panel";
import type { BotStatusResponse } from "@core/lib/api";
import { mapBotState } from "@core/lib/api";
import { toUserMessage } from "@core/lib/errors";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useInstanceChat } from "@/hooks/use-instance-chat";
import type { TabInstance } from "./chat-tabs";
import { ChatTabBar } from "./chat-tabs";
import { FirstRun } from "./first-run";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Direct fetch for fleet instances — bypasses tRPC batch stream link
 * which hangs when other queries in the batch fail.
 */
async function fetchInstances(): Promise<BotStatusResponse[]> {
  const res = await fetch(`${API_BASE}/trpc/fleet.listInstances`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    result?: { data?: { bots?: BotStatusResponse[] } };
  };
  return json.result?.data?.bots ?? [];
}

export function NemoClawApp() {
  const [activeId, setActiveId] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [rawBots, setRawBots] = useState<BotStatusResponse[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadInstances = useCallback(async () => {
    setIsLoading(true);
    const bots = await fetchInstances();
    setRawBots(bots);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadInstances();
    const interval = setInterval(loadInstances, 30_000);
    return () => clearInterval(interval);
  }, [loadInstances]);

  const [claiming, setClaiming] = useState(false);

  async function doClaim(name: string) {
    setClaiming(true);
    try {
      const res = await fetch(`${API_BASE}/trpc/pool.claim`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      setShowAddInput(false);
      toast.success(`${name} created!`);
      await loadInstances();
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to create agent"));
    } finally {
      setClaiming(false);
    }
  }

  const instances: TabInstance[] = useMemo(() => {
    if (!rawBots) return [];
    return rawBots.map((bot) => {
      const rawStatus = mapBotState(bot.state);
      const status: TabInstance["status"] = rawStatus === "running" || rawStatus === "stopped" ? rawStatus : "error";
      return { id: bot.id, name: bot.name, status };
    });
  }, [rawBots]);

  // Auto-select first instance when none is selected
  const resolvedActiveId = activeId && instances.some((i) => i.id === activeId) ? activeId : (instances[0]?.id ?? "");

  const chat = useInstanceChat(resolvedActiveId || null);

  function handleClaim(name: string) {
    doClaim(name);
  }

  function handleAdd() {
    setShowAddInput(true);
  }

  function handleSelect(id: string) {
    setActiveId(id);
    setShowAddInput(false);
  }

  /* --- Loading --- */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/50">
        <Loader2 className="size-5 animate-spin text-indigo-400/60 mr-3" />
        <span className="font-mono text-sm tracking-wide">Loading...</span>
      </div>
    );
  }

  /* --- First run: no instances (also covers batch stream errors) --- */
  if (instances.length === 0) {
    return <FirstRun onClaim={handleClaim} claiming={claiming} />;
  }

  /* --- Main view: tabs + chat --- */
  return (
    <div className="flex flex-col h-full">
      <ChatTabBar instances={instances} activeId={resolvedActiveId} onSelect={handleSelect} onAdd={handleAdd} />

      {showAddInput && (
        <div className="border-b border-border/20 p-4">
          <FirstRun onClaim={handleClaim} claiming={claiming} />
        </div>
      )}

      {resolvedActiveId ? (
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            messages={chat.messages}
            mode="fullscreen"
            isConnected={chat.isConnected}
            isTyping={chat.isTyping}
            onSend={chat.sendMessage}
            onClose={() => {}}
            onFullscreen={() => {}}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-sm text-muted-foreground/30">Select an instance</p>
        </div>
      )}
    </div>
  );
}
