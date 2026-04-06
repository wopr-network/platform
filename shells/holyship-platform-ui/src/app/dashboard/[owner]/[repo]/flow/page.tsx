"use client";

import { use, useCallback, useEffect, useState } from "react";

import { FlowActionBar } from "@/components/repo/flow-action-bar";
import { FlowChat } from "@/components/repo/flow-chat";
import { FlowDiagram } from "@/components/repo/flow-diagram";
import { FlowViewTabs } from "@/components/repo/flow-view-tabs";
import { FlowYamlView } from "@/components/repo/flow-yaml-view";
import { applyFlow, designFlow, editFlow, getFlow } from "@/lib/holyship-client";
import type { DesignedFlow, FlowChatMessage } from "@/lib/types";

export default function FlowPage({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = use(params);

  const [currentYaml, setCurrentYaml] = useState<string | null>(null);
  const [currentFlow, setCurrentFlow] = useState<DesignedFlow | null>(null);
  const [currentSha, setCurrentSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [noFlow, setNoFlow] = useState(false);

  const [pendingYaml, setPendingYaml] = useState<string | null>(null);
  const [pendingFlow, setPendingFlow] = useState<DesignedFlow | null>(null);

  const [messages, setMessages] = useState<FlowChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  const [applying, setApplying] = useState(false);
  const [appliedPr, setAppliedPr] = useState<{ url: string; number: number } | null>(null);

  const [designing, setDesigning] = useState(false);

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

  async function handleDesign() {
    setDesigning(true);
    setMessages((prev) => [...prev, { role: "user", text: "Design a shipping flow for this repo" }]);
    try {
      const result = await designFlow(owner, repo);
      setPendingFlow(result);
      // Serialize to YAML so conversational edits work
      const yaml = JSON.stringify(result, null, 2);
      setPendingYaml(yaml);
      const stateNames = result.states.map((s) => s.name).join(" -> ");
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text: `Designed a ${result.states.length}-state flow: ${stateNames}\n\n${result.notes}`,
        },
      ]);
      setNoFlow(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Design failed";
      setMessages((prev) => [...prev, { role: "ai", text: `Error: ${msg}` }]);
    } finally {
      setDesigning(false);
    }
  }

  async function handleSend(message: string) {
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    try {
      const yamlToSend = pendingYaml ?? currentYaml ?? "";
      const result = await editFlow(owner, repo, message, yamlToSend);
      setPendingYaml(result.updatedYaml);
      setPendingFlow(result.updatedFlow);
      setMessages((prev) => [...prev, { role: "ai", text: result.explanation, changes: result.diff }]);
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
        "Update .holyship/flow.yml via flow editor",
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

  const changeCount = pendingYaml ? messages.reduce((count, m) => count + (m.changes?.length ?? 0), 0) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const displayFlow = pendingFlow ?? currentFlow;
  const displayYaml = pendingYaml ?? currentYaml;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Shipping Flow</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The pipeline that ships issues from spec to merge. Converse to modify.
          </p>
        </div>
      </div>

      {/* No flow — design CTA */}
      {noFlow && !pendingFlow && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-lg font-medium mb-2">No flow configured</p>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Design an AI-powered shipping pipeline tailored to this repo's stack, conventions, and tooling.
          </p>
          <button
            type="button"
            onClick={handleDesign}
            disabled={designing}
            className="rounded-lg bg-signal-orange px-8 py-3 font-bold text-near-black hover:opacity-90 disabled:opacity-50"
          >
            {designing ? "Designing..." : "Design Flow"}
          </button>
          {designing && (
            <p className="text-sm text-muted-foreground mt-4 animate-pulse">
              AI is analyzing the repo and designing an optimal flow...
            </p>
          )}
        </div>
      )}

      {/* Flow view */}
      {(displayFlow || displayYaml) && (
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

      {/* Chat */}
      <FlowChat messages={messages} onSend={handleSend} sending={sending} />

      {/* Apply bar */}
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
