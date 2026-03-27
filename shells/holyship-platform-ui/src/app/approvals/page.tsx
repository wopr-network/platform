"use client";

import { useCallback, useEffect, useState } from "react";
import { ApproveButton } from "../../components/approve-button";

interface PendingApproval {
  entityId: string;
  issueTitle: string;
  issueNumber: number;
  repoFullName: string;
  currentStage: string;
  waitingSince: string;
  artifacts: Record<string, unknown>;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);

  const loadApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals");
      const data = await res.json();
      setApprovals(data.pending ?? []);
    } catch {
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApprovals();
    // Poll every 10 seconds
    const interval = setInterval(loadApprovals, 10_000);
    return () => clearInterval(interval);
  }, [loadApprovals]);

  const daysAgo = (date: string) => {
    const ms = Date.now() - new Date(date).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // Link to view the artifact (spec, PR, etc.) for informed approval
  const getReviewLink = (approval: PendingApproval): { label: string; url: string } | null => {
    const { artifacts, currentStage, repoFullName } = approval;
    if (currentStage === "coding" && artifacts.specUrl) {
      return { label: "Read spec", url: artifacts.specUrl as string };
    }
    if (currentStage === "merging" && artifacts.prUrl) {
      return { label: "Review PR", url: artifacts.prUrl as string };
    }
    if (artifacts.prUrl) {
      return { label: "View PR", url: artifacts.prUrl as string };
    }
    if (approval.issueNumber) {
      return {
        label: "View issue",
        url: `https://github.com/${repoFullName}/issues/${approval.issueNumber}`,
      };
    }
    return null;
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Approvals</h1>
          <p className="text-muted-foreground">
            {approvals.length === 0 && !loading
              ? "Nothing waiting for your approval."
              : `${approvals.length} item${approvals.length !== 1 ? "s" : ""} waiting for review.`}
          </p>
        </div>
        {approvals.length > 1 && (
          <button
            type="button"
            onClick={async () => {
              for (const a of approvals) {
                await fetch(`/api/entities/${a.entityId}/report`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ signal: "human_approved" }),
                });
              }
              loadApprovals();
            }}
            className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-bold hover:bg-amber-700"
          >
            Approve all ({approvals.length})
          </button>
        )}
      </div>

      {loading && <p className="text-muted-foreground">Loading...</p>}

      <div className="space-y-3">
        {approvals.map((approval) => {
          const reviewLink = getReviewLink(approval);
          return (
            <div key={approval.entityId} className="rounded-lg border p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-muted-foreground text-sm">
                      {approval.repoFullName}#{approval.issueNumber}
                    </span>
                    <span className="rounded-full bg-amber-600/20 text-amber-400 border border-amber-600/40 px-2 py-0.5 text-xs font-medium">
                      awaiting approval
                    </span>
                  </div>
                  <p className="font-medium text-lg truncate">{approval.issueTitle}</p>
                  <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                    <span>
                      Completed: <strong className="text-foreground">{approval.currentStage}</strong>
                    </span>
                    <span>·</span>
                    <span>Waiting {daysAgo(approval.waitingSince)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-4">
                  {reviewLink && (
                    <a
                      href={reviewLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      {reviewLink.label}
                    </a>
                  )}
                  <ApproveButton
                    entityId={approval.entityId}
                    stage={approval.currentStage}
                    onApproved={loadApprovals}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
