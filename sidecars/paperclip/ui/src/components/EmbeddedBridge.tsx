import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import type { Agent, Project } from "@paperclipai/shared";

// --- Types for the postMessage protocol ---

export type SidecarMessage =
  | { type: "ready" }
  | { type: "routeChanged"; path: string; title: string }
  | {
      type: "sidebarData";
      payload: {
        companyName: string;
        companyIssuePrefix: string;
        brandColor: string | null;
        projects: Array<{
          id: string;
          name: string;
          urlKey: string;
          color: string | null;
        }>;
        agents: Array<{
          id: string;
          name: string;
          status: string;
          icon: string | null;
          liveRun: boolean;
          liveRunCount: number;
          pauseReason: string | null;
        }>;
        inboxBadge: number;
        failedRuns: number;
        liveRunCount: number;
      };
    }
  | { type: "toast"; level: "success" | "error" | "info"; message: string };

export type PlatformMessage =
  | { type: "navigate"; path: string }
  | {
      type: "command";
      action:
        | "openNewIssue"
        | "openCommandPalette"
        | "openNewAgent"
        | "openNewProject"
        | "openNewGoal";
    }
  | { type: "toast"; level: "success" | "error" | "info"; message: string };

function postToParent(message: SidecarMessage) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(message, window.location.origin);
}

/**
 * Headless bridge component that handles all postMessage communication
 * between the sidecar iframe and the parent platform shell.
 *
 * - Posts `ready` on mount
 * - Posts `routeChanged` on every react-router navigation
 * - Posts `sidebarData` when agents/projects/inbox/liveRuns change
 * - Listens for `navigate` commands from the parent
 * - Listens for `command` actions from the parent (dialog openers)
 */
export function EmbeddedBridge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { openNewIssue, openNewProject, openNewGoal, openNewAgent } =
    useDialog();
  const readySent = useRef(false);
  const inboxBadge = useInboxBadge(selectedCompanyId);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  // Post "ready" once on mount
  useEffect(() => {
    if (!readySent.current) {
      readySent.current = true;
      postToParent({ type: "ready" });
    }
  }, []);

  // Post routeChanged on every navigation
  useEffect(() => {
    postToParent({
      type: "routeChanged",
      path: location.pathname + location.search,
      title: document.title,
    });
  }, [location.pathname, location.search]);

  // Post sidebarData when any source changes
  useEffect(() => {
    if (!selectedCompany) return;

    const liveCountByAgent = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      liveCountByAgent.set(
        run.agentId,
        (liveCountByAgent.get(run.agentId) ?? 0) + 1,
      );
    }

    const visibleAgents = (agents ?? []).filter(
      (a: Agent) => a.status !== "terminated",
    );
    const visibleProjects = (projects ?? []).filter(
      (p: Project) => !p.archivedAt,
    );

    postToParent({
      type: "sidebarData",
      payload: {
        companyName: selectedCompany.name,
        companyIssuePrefix: selectedCompany.issuePrefix,
        brandColor: selectedCompany.brandColor ?? null,
        projects: visibleProjects.map((p: Project) => ({
          id: p.id,
          name: p.name,
          urlKey: p.urlKey,
          color: p.color ?? null,
        })),
        agents: visibleAgents.map((a: Agent) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          icon: a.icon ?? null,
          liveRun: (liveCountByAgent.get(a.id) ?? 0) > 0,
          liveRunCount: liveCountByAgent.get(a.id) ?? 0,
          pauseReason: a.pauseReason ?? null,
        })),
        inboxBadge: inboxBadge.inbox,
        failedRuns: inboxBadge.failedRuns,
        liveRunCount: liveRuns?.length ?? 0,
      },
    });
  }, [selectedCompany, agents, projects, liveRuns, inboxBadge]);

  // Listen for commands from platform
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as PlatformMessage;

      if (data.type === "navigate") {
        navigate(data.path);
      } else if (data.type === "command") {
        switch (data.action) {
          case "openNewIssue":
            openNewIssue();
            break;
          case "openNewAgent":
            openNewAgent();
            break;
          case "openNewProject":
            openNewProject();
            break;
          case "openNewGoal":
            openNewGoal();
            break;
          case "openCommandPalette":
            document.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true }),
            );
            break;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate, openNewIssue, openNewAgent, openNewProject, openNewGoal]);

  return null;
}
