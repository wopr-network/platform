"use client";

import { motion } from "framer-motion";

import type { DesignedFlow, DesignedFlowGate, DesignedFlowTransition } from "@/lib/types";

interface FlowDiagramProps {
  flow: DesignedFlow;
  pendingFlow?: DesignedFlow;
}

const stateColors: Record<string, string> = {
  done: "text-green-400 bg-green-400/15",
  stuck: "text-amber-400 bg-amber-400/15",
  cancelled: "text-red-400 bg-red-400/15",
  budget_exceeded: "text-red-400 bg-red-400/15",
  fix: "text-amber-400 bg-amber-400/15",
};

const defaultColor = "text-sky-400 bg-sky-400/15";

function stateStyle(name: string): string {
  return stateColors[name] ?? defaultColor;
}

type DiffStatus = "added" | "modified" | "removed" | "unchanged";

function diffState(name: string, current: DesignedFlow, pending?: DesignedFlow): DiffStatus {
  if (!pending) return "unchanged";
  const inCurrent = current.states.some((s) => s.name === name);
  const inPending = pending.states.some((s) => s.name === name);
  if (!inCurrent && inPending) return "added";
  if (inCurrent && !inPending) return "removed";
  if (inCurrent && inPending) {
    const cs = current.states.find((s) => s.name === name);
    const ps = pending.states.find((s) => s.name === name);
    if (cs?.agentRole !== ps?.agentRole || cs?.modelTier !== ps?.modelTier || cs?.mode !== ps?.mode) return "modified";
  }
  return "unchanged";
}

const diffStyles: Record<DiffStatus, string> = {
  added: "ring-2 ring-green-400",
  modified: "ring-2 ring-amber-400",
  removed: "opacity-40 line-through",
  unchanged: "",
};

function gateForTransition(from: string, trigger: string, gateWiring: DesignedFlow["gateWiring"]): string | null {
  for (const [gateName, wiring] of Object.entries(gateWiring)) {
    if (wiring.fromState === from && wiring.trigger === trigger) {
      return gateName;
    }
  }
  return null;
}

function findGate(name: string, gates: DesignedFlowGate[]): DesignedFlowGate | undefined {
  return gates.find((g) => g.name === name);
}

function StatePill({ name, diff = "unchanged" }: { name: string; diff?: DiffStatus }) {
  const base = `inline-block rounded-full px-4 py-1.5 text-sm font-semibold ${stateStyle(name)} ${diffStyles[diff]}`;

  if (diff === "added") {
    return (
      <motion.span
        className={base}
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {name}
      </motion.span>
    );
  }

  return <span className={base}>{name}</span>;
}

function Arrow() {
  return <span className="text-muted-foreground text-lg leading-none">&darr;</span>;
}

function GateLabel({ name, gate }: { name: string; gate?: DesignedFlowGate }) {
  const outcomes = gate?.outcomes;
  const redirects = outcomes
    ? Object.entries(outcomes)
        .filter(([, v]) => v.toState)
        .map(([k, v]) => ({ outcome: k, toState: v.toState ?? "" }))
    : [];
  const artifactKey = gate?.primitiveParams?.artifactKey as string | undefined;

  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="text-muted-foreground text-xs">&#128274; {name}</span>
      {redirects.length > 0 && (
        <span className="flex gap-2">
          {redirects.map((r) => (
            <span key={r.outcome} className="text-amber-400/70 text-[10px]">
              {r.outcome} &rarr; {r.toState}
            </span>
          ))}
        </span>
      )}
      {artifactKey && <span className="text-emerald-400/50 text-[10px]">extracts: {artifactKey}</span>}
    </span>
  );
}

function SignalLabel({ signal }: { signal: string }) {
  return <span className="text-muted-foreground text-xs italic">{signal}</span>;
}

const TERMINAL = new Set(["done", "stuck", "cancelled", "budget_exceeded"]);

function buildMainPath(flow: DesignedFlow): {
  path: string[];
  hasReviewFixLoop: boolean;
} {
  const transitions = flow.transitions;
  const initial = flow.flow.initialState;

  const hasReviewToFix = transitions.some((t) => t.fromState === "review" && t.toState === "fix");
  const hasFixToReview = transitions.some((t) => t.fromState === "fix" && t.toState === "review");
  const hasReviewFixLoop = hasReviewToFix && hasFixToReview;

  const visited = new Set<string>();
  const path: string[] = [initial];
  visited.add(initial);

  let current = initial;
  for (let i = 0; i < 50; i++) {
    const next = transitions.find(
      (t) =>
        t.fromState === current &&
        !visited.has(t.toState) &&
        !TERMINAL.has(t.toState) &&
        !(hasReviewFixLoop && t.toState === "fix"),
    );
    if (!next) break;
    path.push(next.toState);
    visited.add(next.toState);
    current = next.toState;
  }

  return { path, hasReviewFixLoop };
}

function ReviewFixLoop({
  transitions,
  gateWiring,
  flow,
  pendingFlow,
}: {
  transitions: DesignedFlowTransition[];
  gateWiring: DesignedFlow["gateWiring"];
  flow: DesignedFlow;
  pendingFlow?: DesignedFlow;
}) {
  const reviewToFix = transitions.find((t) => t.fromState === "review" && t.toState === "fix");
  const fixToReview = transitions.find((t) => t.fromState === "fix" && t.toState === "review");

  return (
    <div className="flex items-center gap-4">
      <StatePill name="review" diff={diffState("review", flow, pendingFlow)} />
      <div className="flex flex-col items-center gap-0.5">
        {reviewToFix && <SignalLabel signal={`\u2192 ${reviewToFix.trigger}`} />}
        <span className="text-muted-foreground text-sm">&harr;</span>
        {fixToReview && <SignalLabel signal={`\u2190 ${fixToReview.trigger}`} />}
      </div>
      <StatePill name="fix" diff={diffState("fix", flow, pendingFlow)} />
      {reviewToFix && gateForTransition(reviewToFix.fromState, reviewToFix.trigger, gateWiring) && (
        <GateLabel
          name={gateForTransition(reviewToFix.fromState, reviewToFix.trigger, gateWiring) ?? ""}
          gate={findGate(
            gateForTransition(reviewToFix.fromState, reviewToFix.trigger, gateWiring) ?? "",
            (pendingFlow ?? flow).gates,
          )}
        />
      )}
    </div>
  );
}

export function FlowDiagram({ flow, pendingFlow }: FlowDiagramProps) {
  const displayFlow = pendingFlow ?? flow;
  const { path, hasReviewFixLoop } = buildMainPath(displayFlow);
  const terminalStates = displayFlow.states.filter((s) => TERMINAL.has(s.name)).map((s) => s.name);

  const removedStateNames = pendingFlow
    ? flow.states.map((s) => s.name).filter((name) => !pendingFlow.states.some((s) => s.name === name))
    : [];

  return (
    <div className="bg-muted/30 rounded-lg p-4 space-y-1">
      <div className="flex flex-col items-center gap-1">
        {path.map((state, idx) => {
          const isReview = state === "review" && hasReviewFixLoop;
          const nextState = path[idx + 1];
          const transition = displayFlow.transitions.find((t) => t.fromState === state && t.toState === nextState);
          const gate = transition
            ? gateForTransition(transition.fromState, transition.trigger, displayFlow.gateWiring)
            : null;

          return (
            <div key={state} className="flex flex-col items-center gap-1">
              {isReview ? (
                <ReviewFixLoop
                  transitions={displayFlow.transitions}
                  gateWiring={displayFlow.gateWiring}
                  flow={flow}
                  pendingFlow={pendingFlow}
                />
              ) : (
                <StatePill name={state} diff={diffState(state, flow, pendingFlow)} />
              )}

              {idx < path.length - 1 && (
                <div className="flex flex-col items-center gap-0.5">
                  {gate && <GateLabel name={gate} gate={findGate(gate, displayFlow.gates)} />}
                  {transition && <SignalLabel signal={transition.trigger} />}
                  <Arrow />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {terminalStates.length > 0 && (
        <div className="flex flex-col items-center gap-1 pt-2">
          <Arrow />
          <div className="flex flex-wrap justify-center gap-2">
            {terminalStates.map((s) => (
              <StatePill key={s} name={s} diff={diffState(s, flow, pendingFlow)} />
            ))}
          </div>
        </div>
      )}

      {removedStateNames.length > 0 && (
        <div className="flex flex-col items-center gap-1 pt-2">
          <span className="text-muted-foreground text-xs">Removed</span>
          <div className="flex flex-wrap justify-center gap-2">
            {removedStateNames.map((s) => (
              <StatePill key={s} name={s} diff="removed" />
            ))}
          </div>
        </div>
      )}

      {displayFlow.notes && <p className="text-muted-foreground pt-3 text-sm italic">{displayFlow.notes}</p>}
    </div>
  );
}
