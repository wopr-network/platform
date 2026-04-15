"use client";

import { ChatPanel } from "@core/components/chat/chat-panel";
import type { Instance } from "@core/lib/api";
import { createInstance, listInstances } from "@core/lib/api";
import { toUserMessage } from "@core/lib/errors";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useInstanceChat } from "@/hooks/use-instance-chat";
import type { TabInstance } from "./chat-tabs";
import { ChatTabBar } from "./chat-tabs";
import { FirstRun } from "./first-run";

export function NemoClawApp() {
  const [activeId, setActiveId] = useState("");
  const [showAddInput, setShowAddInput] = useState(false);
  const [bots, setBots] = useState<Instance[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadInstances = useCallback(async () => {
    setIsLoading(true);
    try {
      setBots(await listInstances());
    } catch {
      setBots([]);
    } finally {
      setIsLoading(false);
    }
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
      // Use the shared tRPC helper (paperclip uses the same) rather than
      // raw-fetching an endpoint name. `pool.claim` was the old wire and
      // no longer exists on core — `fleet.createInstance` is the current
      // shared procedure. Provider "nemoclaw" routes to the Nemoclaw
      // product's fleet config (container_image, port, etc.) on the
      // server side via productSlug context.
      await createInstance({
        name,
        provider: "nemoclaw",
        channels: [],
        plugins: [],
      });
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
    if (!bots) return [];
    return bots.map((bot) => {
      const status: TabInstance["status"] = bot.status === "running" || bot.status === "stopped" ? bot.status : "error";
      return { id: bot.id, name: bot.name, status };
    });
  }, [bots]);

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
