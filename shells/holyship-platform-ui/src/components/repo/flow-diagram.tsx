"use client";

import { motion } from "framer-motion";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import type { DesignedFlow, DesignedFlowGate, DesignedFlowTransition } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface FlowDiagramProps {
  flow: DesignedFlow;
  pendingFlow?: DesignedFlow;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NODE_W = 160;
const NODE_H = 48;
const GATE_SIZE = 32;
const ROW_GAP = 80;
const COL_GAP = 200;
const PAD_X = 40;
const PAD_Y = 30;

const TERMINAL = new Set(["done", "stuck", "cancelled", "budget_exceeded"]);

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                     */
/* ------------------------------------------------------------------ */

function stateColor(name: string): {
  fill: string;
  stroke: string;
  text: string;
} {
  if (name === "done")
    return {
      fill: "rgba(34,197,94,0.12)",
      stroke: "#22c55e",
      text: "#4ade80",
    };
  if (name === "stuck")
    return {
      fill: "rgba(234,179,8,0.12)",
      stroke: "#eab308",
      text: "#facc15",
    };
  if (name === "cancelled" || name === "budget_exceeded")
    return {
      fill: "rgba(239,68,68,0.12)",
      stroke: "#ef4444",
      text: "#f87171",
    };
  if (name === "fix")
    return {
      fill: "rgba(234,179,8,0.12)",
      stroke: "#eab308",
      text: "#facc15",
    };
  return {
    fill: "rgba(56,189,248,0.10)",
    stroke: "#38bdf8",
    text: "#7dd3fc",
  };
}

const GATE_FILL = "rgba(251,146,60,0.15)";
const GATE_STROKE = "#fb923c";

/* ------------------------------------------------------------------ */
/*  Diff helpers                                                       */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Gate lookup helpers                                                */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Layout engine                                                      */
/* ------------------------------------------------------------------ */

interface NodePos {
  name: string;
  x: number;
  y: number;
  row: number;
  col: number;
  isTerminal: boolean;
}

interface GatePos {
  gateName: string;
  gate: DesignedFlowGate | undefined;
  cx: number;
  cy: number;
  transition: DesignedFlowTransition;
}

interface Edge {
  from: NodePos;
  to: NodePos;
  transition: DesignedFlowTransition;
  gate?: GatePos;
  isBackEdge: boolean;
}

interface LayoutResult {
  nodes: NodePos[];
  gates: GatePos[];
  edges: Edge[];
  width: number;
  height: number;
}

function buildLayout(flow: DesignedFlow): LayoutResult {
  const transitions = flow.transitions;
  const initial = flow.flow.initialState;

  // Separate into review-fix loop detection
  const hasReviewToFix = transitions.some((t) => t.fromState === "review" && t.toState === "fix");
  const hasFixToReview = transitions.some((t) => t.fromState === "fix" && t.toState === "review");
  const hasReviewFixLoop = hasReviewToFix && hasFixToReview;

  // Build main path (top to bottom, skipping fix if it's in the loop)
  const visited = new Set<string>();
  const mainPath: string[] = [initial];
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
    mainPath.push(next.toState);
    visited.add(next.toState);
    current = next.toState;
  }

  // Place terminal states in a row at the bottom
  const terminalStates = flow.states.filter((s) => TERMINAL.has(s.name)).map((s) => s.name);

  // If review-fix loop exists, place fix to the right of review
  const fixCol = hasReviewFixLoop ? 1 : -1;
  const reviewRow = mainPath.indexOf("review");

  // Compute node positions
  const nodes: NodePos[] = [];
  const nodeMap = new Map<string, NodePos>();

  // Main path nodes (col=0)
  for (let i = 0; i < mainPath.length; i++) {
    const node: NodePos = {
      name: mainPath[i],
      x: PAD_X,
      y: PAD_Y + i * ROW_GAP,
      row: i,
      col: 0,
      isTerminal: false,
    };
    nodes.push(node);
    nodeMap.set(mainPath[i], node);
  }

  // Fix node (col=1, same row as review)
  if (hasReviewFixLoop && reviewRow >= 0) {
    const fixNode: NodePos = {
      name: "fix",
      x: PAD_X + COL_GAP,
      y: PAD_Y + reviewRow * ROW_GAP,
      row: reviewRow,
      col: fixCol,
      isTerminal: false,
    };
    nodes.push(fixNode);
    nodeMap.set("fix", fixNode);
  }

  // Terminal states row
  const terminalRow = mainPath.length;
  const terminalTotalW = terminalStates.length * NODE_W + (terminalStates.length - 1) * 24;
  const mainCenterX = PAD_X + NODE_W / 2;
  const terminalStartX = Math.max(PAD_X, mainCenterX - terminalTotalW / 2);

  for (let i = 0; i < terminalStates.length; i++) {
    const node: NodePos = {
      name: terminalStates[i],
      x: terminalStartX + i * (NODE_W + 24),
      y: PAD_Y + terminalRow * ROW_GAP,
      row: terminalRow,
      col: i,
      isTerminal: true,
    };
    nodes.push(node);
    nodeMap.set(terminalStates[i], node);
  }

  // Build edges and gate positions
  const edges: Edge[] = [];
  const gates: GatePos[] = [];

  for (const t of transitions) {
    const fromNode = nodeMap.get(t.fromState);
    const toNode = nodeMap.get(t.toState);
    if (!fromNode || !toNode) continue;

    // Detect back-edge (going up in rows, e.g. fix -> review)
    const isBackEdge =
      toNode.row < fromNode.row ||
      (toNode.row === fromNode.row && toNode.col < fromNode.col && fromNode.name === "fix");

    // Gate on this transition?
    const gateName = gateForTransition(t.fromState, t.trigger, flow.gateWiring);
    let gatePos: GatePos | undefined;
    if (gateName) {
      const gate = findGate(gateName, flow.gates);
      // Position gate at midpoint of edge
      const midX = (fromNode.x + NODE_W / 2 + toNode.x + NODE_W / 2) / 2;
      const midY = (fromNode.y + NODE_H / 2 + toNode.y + NODE_H / 2) / 2;
      gatePos = {
        gateName,
        gate,
        cx: midX,
        cy: midY,
        transition: t,
      };
      gates.push(gatePos);
    }

    edges.push({
      from: fromNode,
      to: toNode,
      transition: t,
      gate: gatePos,
      isBackEdge,
    });
  }

  // Compute canvas size
  const maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + PAD_X;
  const maxY = Math.max(...nodes.map((n) => n.y + NODE_H)) + PAD_Y;

  return {
    nodes,
    gates,
    edges,
    width: maxX,
    height: maxY,
  };
}

/* ------------------------------------------------------------------ */
/*  SVG arrow path builder                                             */
/* ------------------------------------------------------------------ */

function buildArrowPath(from: NodePos, to: NodePos, isBackEdge: boolean, gate?: GatePos): string {
  const fx = from.x + NODE_W / 2;
  const fy = from.y + NODE_H;
  const tx = to.x + NODE_W / 2;
  const ty = to.y;

  if (isBackEdge) {
    // Back-edge: route around the right side for fix->review
    if (from.col > to.col) {
      // fix is to the right, arrow goes up-left
      const startX = from.x;
      const startY = from.y + NODE_H / 2;
      const endX = to.x + NODE_W;
      const endY = to.y + NODE_H / 2;
      const loopX = Math.min(from.x, to.x + NODE_W) + (COL_GAP - NODE_W) / 2;
      return `M ${startX} ${startY} C ${loopX} ${startY}, ${loopX} ${endY}, ${endX} ${endY}`;
    }
    // Generic back-edge: route to the right
    const offset = 40;
    const rightX = Math.max(fx, tx) + NODE_W / 2 + offset;
    return `M ${fx} ${fy} C ${fx} ${fy + 20}, ${rightX} ${fy + 20}, ${rightX} ${(fy + ty) / 2} S ${tx} ${ty - 20}, ${tx} ${ty}`;
  }

  if (gate) {
    // Route through gate: from -> gate -> to
    const gx = gate.cx;
    const gy = gate.cy;
    return `M ${fx} ${fy} L ${gx} ${gy - GATE_SIZE / 2} M ${gx} ${gy + GATE_SIZE / 2} L ${tx} ${ty}`;
  }

  // Straight or slight curve for forward edges
  if (Math.abs(fx - tx) < 2) {
    return `M ${fx} ${fy} L ${tx} ${ty}`;
  }

  // Curved path for different columns
  const midY = (fy + ty) / 2;
  return `M ${fx} ${fy} C ${fx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
}

/* ------------------------------------------------------------------ */
/*  SVG Arrowhead marker                                               */
/* ------------------------------------------------------------------ */

function ArrowDefs() {
  return (
    <defs>
      <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <path d="M 0 0 L 8 3 L 0 6 Z" fill="#64748b" />
      </marker>
      <marker id="arrowhead-back" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
        <path d="M 0 0 L 8 3 L 0 6 Z" fill="#fb923c" />
      </marker>
      <filter id="glow-green">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-amber">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG State Node                                                     */
/* ------------------------------------------------------------------ */

function StateNode({
  node,
  diff,
  state,
}: {
  node: NodePos;
  diff: DiffStatus;
  state?: { agentRole?: string; modelTier?: string };
}) {
  const color = stateColor(node.name);
  const isAdded = diff === "added";
  const isModified = diff === "modified";
  const isRemoved = diff === "removed";

  const glowFilter = isAdded ? "url(#glow-green)" : isModified ? "url(#glow-amber)" : undefined;
  const strokeColor = isAdded ? "#22c55e" : isModified ? "#eab308" : color.stroke;
  const strokeWidth = isAdded || isModified ? 2 : 1;
  const opacity = isRemoved ? 0.35 : 1;

  const subtitleParts: string[] = [];
  if (state?.agentRole) subtitleParts.push(state.agentRole);
  if (state?.modelTier) subtitleParts.push(state.modelTier);
  const subtitle = subtitleParts.join(" / ");

  const rectEl = (
    <g opacity={opacity} filter={glowFilter}>
      <rect
        x={node.x}
        y={node.y}
        width={NODE_W}
        height={NODE_H}
        rx={12}
        ry={12}
        fill={color.fill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={isRemoved ? "4 3" : undefined}
      />
      <text
        x={node.x + NODE_W / 2}
        y={node.y + (subtitle ? NODE_H / 2 - 4 : NODE_H / 2 + 1)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color.text}
        fontSize={13}
        fontWeight={600}
        fontFamily="ui-monospace, monospace"
      >
        {node.name}
      </text>
      {subtitle && (
        <text
          x={node.x + NODE_W / 2}
          y={node.y + NODE_H / 2 + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color.text}
          fontSize={9}
          opacity={0.6}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {subtitle}
        </text>
      )}
    </g>
  );

  if (isAdded) {
    return (
      <motion.g
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{
          duration: 2,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
      >
        {rectEl}
      </motion.g>
    );
  }

  return rectEl;
}

/* ------------------------------------------------------------------ */
/*  SVG Gate diamond                                                   */
/* ------------------------------------------------------------------ */

function GateDiamond({ gate: gatePos }: { gate: GatePos }) {
  const { cx, cy, gateName, gate } = gatePos;
  const s = GATE_SIZE / 2;
  const points = `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;

  const outcomes = gate?.outcomes;
  const outcomeLabels = outcomes
    ? Object.entries(outcomes)
        .filter(([, v]) => v.toState)
        .map(([k]) => k)
    : [];

  return (
    <g>
      <polygon points={points} fill={GATE_FILL} stroke={GATE_STROKE} strokeWidth={1.5} />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={GATE_STROKE}
        fontSize={8}
        fontWeight={600}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {gate?.type === "primitive" ? "\u2699" : "\u25C6"}
      </text>
      {/* Gate name label */}
      <text
        x={cx + s + 6}
        y={cy - 2}
        textAnchor="start"
        dominantBaseline="middle"
        fill={GATE_STROKE}
        fontSize={9}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {gateName}
      </text>
      {outcomeLabels.length > 0 && (
        <text
          x={cx + s + 6}
          y={cy + 9}
          textAnchor="start"
          dominantBaseline="middle"
          fill="#94a3b8"
          fontSize={8}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {outcomeLabels.join(" | ")}
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG Edge with trigger label                                        */
/* ------------------------------------------------------------------ */

function EdgePath({ edge }: { edge: Edge }) {
  const pathD = buildArrowPath(edge.from, edge.to, edge.isBackEdge, edge.gate);
  const color = edge.isBackEdge ? "#fb923c" : "#475569";
  const marker = edge.isBackEdge ? "url(#arrowhead-back)" : "url(#arrowhead)";

  // Compute label position
  const fx = edge.from.x + NODE_W / 2;
  const fy = edge.from.y + NODE_H;
  const tx = edge.to.x + NODE_W / 2;
  const ty = edge.to.y;

  let labelX: number;
  let labelY: number;

  if (edge.isBackEdge && edge.from.col > edge.to.col) {
    // fix->review loop label
    labelX = (edge.from.x + edge.to.x + NODE_W) / 2;
    labelY = (edge.from.y + edge.to.y + NODE_H) / 2 - 10;
  } else {
    labelX = (fx + tx) / 2;
    labelY = (fy + ty) / 2;
  }

  // Offset label to avoid gate
  if (edge.gate) {
    labelY = fy + (ty - fy) * 0.25;
  }

  return (
    <g>
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={edge.isBackEdge ? "6 3" : undefined}
        markerEnd={marker}
        opacity={0.7}
      />
      {edge.transition.trigger && !edge.gate && (
        <text
          x={labelX + 10}
          y={labelY}
          textAnchor="start"
          dominantBaseline="middle"
          fill="#94a3b8"
          fontSize={9}
          fontStyle="italic"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {edge.transition.trigger}
        </text>
      )}
      {edge.transition.trigger && edge.gate && (
        <text
          x={labelX + 10}
          y={labelY}
          textAnchor="start"
          dominantBaseline="middle"
          fill="#94a3b8"
          fontSize={9}
          fontStyle="italic"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {edge.transition.trigger}
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function FlowDiagram({ flow, pendingFlow }: FlowDiagramProps) {
  const displayFlow = pendingFlow ?? flow;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => buildLayout(displayFlow), [displayFlow]);

  // Build a lookup for state metadata
  const stateMetaMap = useMemo(() => {
    const map = new Map<string, { agentRole?: string; modelTier?: string }>();
    for (const s of displayFlow.states) {
      map.set(s.name, { agentRole: s.agentRole, modelTier: s.modelTier });
    }
    return map;
  }, [displayFlow.states]);

  // Removed states
  const removedStateNames = pendingFlow
    ? flow.states.map((s) => s.name).filter((name) => !pendingFlow.states.some((s) => s.name === name))
    : [];

  // Compute scale
  const svgWidth = layout.width;
  const svgHeight = layout.height;
  const scale = containerWidth > 0 ? Math.min(1, containerWidth / svgWidth) : 1;
  const displayHeight = svgHeight * scale;

  return (
    <div ref={containerRef} className="bg-muted/30 rounded-lg p-4">
      {/* Flow title */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {displayFlow.flow.name}
        </span>
        {displayFlow.flow.description && (
          <span className="text-xs text-muted-foreground/60">&mdash; {displayFlow.flow.description}</span>
        )}
      </div>

      {/* SVG Flowchart */}
      <div className="w-full overflow-x-auto" style={{ height: displayHeight || "auto" }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width={svgWidth * scale}
          height={svgHeight * scale}
          className="block"
          role="img"
          aria-label={`Flow diagram for ${displayFlow.flow.name}`}
        >
          <ArrowDefs />

          {/* Edges (render first, behind nodes) */}
          {layout.edges.map((edge) => (
            <EdgePath
              key={`${edge.transition.fromState}-${edge.transition.toState}-${edge.transition.trigger}`}
              edge={edge}
            />
          ))}

          {/* Gates */}
          {layout.gates.map((g) => (
            <GateDiamond key={g.gateName} gate={g} />
          ))}

          {/* Nodes */}
          {layout.nodes.map((node) => (
            <StateNode
              key={node.name}
              node={node}
              diff={diffState(node.name, flow, pendingFlow)}
              state={stateMetaMap.get(node.name)}
            />
          ))}
        </svg>
      </div>

      {/* Removed states (shown below diagram) */}
      {removedStateNames.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Removed:</span>
          {removedStateNames.map((name) => (
            <span key={name} className="text-xs text-red-400/60 line-through px-2 py-0.5 rounded bg-red-400/10">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {displayFlow.notes && <p className="text-muted-foreground pt-3 text-sm italic">{displayFlow.notes}</p>}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border/40 pt-3">
        <LegendItem color="#38bdf8" label="State" />
        <LegendItem color="#22c55e" label="Done" />
        <LegendItem color="#ef4444" label="Error" />
        <LegendItem color="#eab308" label="Warning" />
        <LegendItem color="#fb923c" label="Gate" shape="diamond" />
        <span className="text-[10px] text-muted-foreground/50 ml-auto">
          {displayFlow.states.length} states &middot; {displayFlow.transitions.length} transitions &middot;{" "}
          {displayFlow.gates.length} gates
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Legend helper                                                       */
/* ------------------------------------------------------------------ */

function LegendItem({ color, label, shape = "rect" }: { color: string; label: string; shape?: "rect" | "diamond" }) {
  return (
    <span className="flex items-center gap-1.5">
      {shape === "diamond" ? (
        <svg width={10} height={10} viewBox="0 0 10 10" role="img" aria-label={`${label} legend icon`}>
          <polygon points="5,0 10,5 5,10 0,5" fill={color} opacity={0.5} />
        </svg>
      ) : (
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm"
          style={
            {
              backgroundColor: color,
              opacity: 0.5,
            } as CSSProperties
          }
        />
      )}
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </span>
  );
}
