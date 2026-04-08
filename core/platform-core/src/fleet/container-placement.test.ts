import { describe, expect, it } from "vitest";
import {
  LeastLoadedStrategy,
  type PlacementContext,
  RoundRobinStrategy,
  WeightedScoringStrategy,
} from "./container-placement.js";
import type { NodeEntry } from "./node-registry.js";

function makeNode(id: string, maxContainers = 0): NodeEntry {
  return {
    config: { id, name: id, host: "localhost", maxContainers },
    docker: {} as never,
    fleet: {} as never,
  };
}

function makeContext(overrides: Partial<PlacementContext> = {}): PlacementContext {
  return {
    containerCounts: new Map(),
    nodeMetrics: new Map(),
    ...overrides,
  };
}

describe("WeightedScoringStrategy", () => {
  const strategy = new WeightedScoringStrategy();

  it("selects the node with more free memory", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const ctx = makeContext({
      nodeMetrics: new Map([
        ["a", { capacityMb: 1000, usedMb: 900, lastHeartbeatAt: Date.now() / 1000, status: "active" }],
        ["b", { capacityMb: 1000, usedMb: 200, lastHeartbeatAt: Date.now() / 1000, status: "active" }],
      ]),
    });
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("b");
  });

  it("prefers healthy nodes over unhealthy ones", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const ctx = makeContext({
      nodeMetrics: new Map([
        ["a", { capacityMb: 1000, usedMb: 500, lastHeartbeatAt: Date.now() / 1000, status: "unhealthy" }],
        ["b", { capacityMb: 1000, usedMb: 600, lastHeartbeatAt: Date.now() / 1000, status: "active" }],
      ]),
    });
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("b");
  });

  it("skips nodes at max capacity", () => {
    const nodes = [makeNode("a", 2), makeNode("b", 5)];
    const ctx = makeContext({
      containerCounts: new Map([
        ["a", 2],
        ["b", 1],
      ]),
    });
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("b");
  });

  it("throws when all nodes are at capacity", () => {
    const nodes = [makeNode("a", 1)];
    const ctx = makeContext({
      containerCounts: new Map([["a", 1]]),
    });
    expect(() => strategy.selectNode(nodes, ctx)).toThrow("No available nodes");
  });

  it("applies locality bonus for tenant's existing node", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const ctx = makeContext({
      nodeMetrics: new Map([
        ["a", { capacityMb: 1000, usedMb: 500, lastHeartbeatAt: Date.now() / 1000, status: "active" }],
        ["b", { capacityMb: 1000, usedMb: 500, lastHeartbeatAt: Date.now() / 1000, status: "active" }],
      ]),
      tenantNodes: new Set(["a"]),
    });
    // Equal scores — locality bonus breaks the tie
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("a");
  });

  it("penalizes stale heartbeats", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const staleTime = (Date.now() - 120_000) / 1000; // 2 minutes ago
    const freshTime = Date.now() / 1000;
    const ctx = makeContext({
      nodeMetrics: new Map([
        ["a", { capacityMb: 1000, usedMb: 500, lastHeartbeatAt: staleTime, status: "active" }],
        ["b", { capacityMb: 1000, usedMb: 500, lastHeartbeatAt: freshTime, status: "active" }],
      ]),
    });
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("b");
  });

  it("works with no metrics (local node fallback)", () => {
    const nodes = [makeNode("a")];
    const ctx = makeContext();
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("a");
  });
});

describe("LeastLoadedStrategy", () => {
  const strategy = new LeastLoadedStrategy();

  it("picks the node with fewest containers", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const ctx = makeContext({
      containerCounts: new Map([
        ["a", 5],
        ["b", 2],
      ]),
    });
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("b");
  });

  it("skips nodes at capacity", () => {
    const nodes = [makeNode("a", 2), makeNode("b")];
    const ctx = makeContext({
      containerCounts: new Map([
        ["a", 2],
        ["b", 3],
      ]),
    });
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("b");
  });
});

describe("RoundRobinStrategy", () => {
  const strategy = new RoundRobinStrategy();

  it("cycles through nodes", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const ctx = makeContext();
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("a");
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("b");
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("c");
    expect(strategy.selectNode(nodes, ctx).config.id).toBe("a");
  });
});
