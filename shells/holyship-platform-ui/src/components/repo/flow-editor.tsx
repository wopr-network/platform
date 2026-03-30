"use client";

import { useCallback, useEffect, useState } from "react";
import { FlowActionBar } from "@/components/repo/flow-action-bar";
import { FlowChat } from "@/components/repo/flow-chat";
import { FlowDiagram } from "@/components/repo/flow-diagram";
import { FlowViewTabs } from "@/components/repo/flow-view-tabs";
import { FlowYamlView } from "@/components/repo/flow-yaml-view";
import { applyFlow, editFlow, getFlow } from "@/lib/holyship-client";
import type { DesignedFlow, FlowChatMessage, RepoConfig } from "@/lib/types";

interface FlowEditorProps {
  owner: string;
  repo: string;
  config: RepoConfig;
}

export function FlowEditor({ owner, repo, config: _config }: FlowEditorProps) {
  // Current state from repo
  const [currentYaml, setCurrentYaml] = useState<string | null>(null);
  const [currentFlow, setCurrentFlow] = useState<DesignedFlow | null>(null);
  const [currentSha, setCurrentSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [noFlow, setNoFlow] = useState(false);

  // Pending state from edits
  const [pendingYaml, setPendingYaml] = useState<string | null>(null);
  const [pendingFlow, setPendingFlow] = useState<DesignedFlow | null>(null);

  // Chat
  const [messages, setMessages] = useState<FlowChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  // Apply
  const [applying, setApplying] = useState(false);
  const [appliedPr, setAppliedPr] = useState<{
    url: string;
    number: number;
  } | null>(null);

  // View
  const [activeTab, setActiveTab] = useState<"visual" | "text">("visual");

  const loadFlow = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFlow(owner, repo);
      if (result) {
        setCurrentYaml(result.yaml);
        setCurrentFlow(result.flow);
        setCurrentSha(result.sha);
        setNoFlow(false);
      } else {
        setCurrentYaml(null);
        setCurrentFlow(null);
        setCurrentSha(null);
        setNoFlow(true);
      }
    } catch {
      setNoFlow(true);
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

  async function handleSend(message: string) {
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    try {
      const yamlToSend = pendingYaml ?? currentYaml ?? "";
      const result = await editFlow(owner, repo, message, yamlToSend);
      setPendingYaml(result.updatedYaml);
      setPendingFlow(result.updatedFlow);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: result.explanation,
          changes: result.diff,
        },
      ]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      const isParseError = errorMsg.includes("422");
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: isParseError ? "Couldn't understand the response \u2014 try rephrasing." : `Error: ${errorMsg}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function handleApply() {
    if (!pendingYaml) return;
    setApplying(true);
    try {
      const result = await applyFlow(
        owner,
        repo,
        pendingYaml,
        `Update .holyship/flow.yml via visual editor`,
        currentSha ?? "",
      );
      setAppliedPr({ url: result.prUrl, number: result.prNumber });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to create PR";
      setMessages((prev) => [...prev, { role: "ai", text: `Failed to apply: ${errorMsg}` }]);
    } finally {
      setApplying(false);
    }
  }

  function handleDiscard() {
    setPendingYaml(null);
    setPendingFlow(null);
    setAppliedPr(null);
  }

  // Diff count: number of lines in the diff
  const changeCount = pendingYaml ? messages.reduce((count, m) => count + (m.changes?.length ?? 0), 0) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const displayFlow = pendingFlow ?? currentFlow;
  const displayYaml = pendingYaml ?? currentYaml;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Flow</h3>

      {noFlow && !pendingFlow ? (
        <p className="text-sm text-muted-foreground">
          No flow configured. Describe what you want below, or run analysis to generate one.
        </p>
      ) : (
        <>
          <FlowViewTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            pendingChangeCount={changeCount > 0 ? changeCount : undefined}
          />

          {activeTab === "visual" && displayFlow && (
            <FlowDiagram flow={currentFlow ?? displayFlow} pendingFlow={pendingFlow ?? undefined} />
          )}

          {activeTab === "text" && displayYaml && (
            <FlowYamlView yaml={currentYaml ?? ""} pendingYaml={pendingYaml ?? undefined} />
          )}
        </>
      )}

      <FlowChat messages={messages} onSend={handleSend} sending={sending} />

      {pendingYaml && (
        <FlowActionBar
          changeCount={changeCount}
          onDiscard={handleDiscard}
          onApply={handleApply}
          applying={applying}
          appliedPr={appliedPr}
        />
      )}
    </div>
  );
}
