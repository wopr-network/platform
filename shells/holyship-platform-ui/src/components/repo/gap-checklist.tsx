"use client";

import { useState } from "react";

import { createAllIssues, createIssueFromGap } from "@/lib/holyship-client";
import type { Gap } from "@/lib/types";

interface GapChecklistProps {
  gaps: Gap[];
  owner: string;
  repo: string;
  onUpdate?: () => void;
}

const priorityStyles: Record<Gap["priority"], string> = {
  critical: "bg-red-600/20 text-red-400",
  high: "bg-red-600/20 text-red-400",
  medium: "bg-amber-600/20 text-amber-400",
  low: "bg-muted text-muted-foreground",
};

function PriorityBadge({ priority }: { priority: Gap["priority"] }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${priorityStyles[priority]}`}>
      {priority}
    </span>
  );
}

export function GapChecklist({ gaps, owner, repo, onUpdate }: GapChecklistProps) {
  const [creating, setCreating] = useState<Set<string>>(new Set());
  const [creatingAll, setCreatingAll] = useState(false);

  async function handleCreateOne(gapId: string) {
    setCreating((prev) => new Set(prev).add(gapId));
    try {
      await createIssueFromGap(owner, repo, gapId);
      onUpdate?.();
    } finally {
      setCreating((prev) => {
        const next = new Set(prev);
        next.delete(gapId);
        return next;
      });
    }
  }

  async function handleCreateAll() {
    setCreatingAll(true);
    try {
      await createAllIssues(owner, repo);
      onUpdate?.();
    } finally {
      setCreatingAll(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {gaps.length} Gap{gaps.length !== 1 ? "s" : ""} Found
        </h3>
        <button
          type="button"
          onClick={handleCreateAll}
          disabled={creatingAll || gaps.every((g) => g.status === "issue_created")}
          className="rounded-md border border-green-600 text-green-400 px-3 py-1 text-xs font-medium hover:bg-green-600/10 disabled:opacity-50"
        >
          {creatingAll ? "Creating..." : "Create All Issues"}
        </button>
      </div>

      <div className="space-y-2">
        {gaps.map((gap) => {
          const isCreated = gap.status === "issue_created";
          const isCreating = creating.has(gap.id);

          return (
            <div key={gap.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <PriorityBadge priority={gap.priority} />
                <span className="truncate text-sm">{gap.title}</span>
              </div>

              {isCreated && gap.issueUrl ? (
                <a
                  href={gap.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-green-400 hover:underline"
                >
                  Created &#10003;
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCreateOne(gap.id)}
                  disabled={isCreating || creatingAll}
                  className="shrink-0 rounded-md bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80 disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : "Create Issue"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
