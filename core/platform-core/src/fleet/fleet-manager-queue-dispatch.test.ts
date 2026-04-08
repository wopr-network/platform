/**
 * Verifies that FleetManager.sendCommand routes through the OperationQueue
 * when the queue is wired via setDeps, and falls back to the WS command bus
 * otherwise. This is the Phase 2.3b cut-over test — proves the routing flip
 * works without changing observable behavior on either path.
 *
 * The test uses a recording fake `IOperationQueue` so we can assert exactly
 * which `execute(req)` arguments FleetManager produces — type, target, payload.
 * The actual queue end-to-end is tested in instance-create-handler.test.ts;
 * this test is about the dispatch site, not the queue itself.
 */

import { describe, expect, it } from "vitest";
import type { IOperationQueue, OperationRequest } from "../queue/operation-queue.js";
import { FleetManager } from "./fleet-manager.js";
import type { INodeCommandBus } from "./node-command-bus.js";
import type { IProfileStore } from "./profile-store.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeFakeQueue(): IOperationQueue & { calls: OperationRequest[] } {
  const calls: OperationRequest[] = [];
  return {
    calls,
    execute: async <T>(req: OperationRequest): Promise<T> => {
      calls.push(req);
      return { fromQueue: true } as T;
    },
    claim: async () => null,
    complete: async () => {},
    fail: async () => {},
    janitorSweep: async () => ({ reset: 0 }),
    startListener: async () => {},
    stopListener: async () => {},
    subscribeEnqueued: async () => {},
  } as IOperationQueue & { calls: OperationRequest[] };
}

function makeFakeBus(): INodeCommandBus & { calls: { nodeId: string; command: unknown }[] } {
  const calls: { nodeId: string; command: unknown }[] = [];
  return {
    calls,
    send: async (nodeId: string, command: unknown) => {
      calls.push({ nodeId, command });
      return { fromBus: true };
    },
  } as never;
}

const stubStore: IProfileStore = {
  list: async () => [],
  save: async () => {},
  delete: async () => {},
} as never;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/**
 * Helper that drills into FleetManager's private sendCommand. We do this once
 * here so the rest of the tests stay readable. Both transports go through it,
 * so it's the only surface we need to assert against.
 */
type SendCommandAccess = { sendCommand: (type: string, payload: Record<string, unknown>) => Promise<unknown> };
function callSendCommand(fm: FleetManager, type: string, payload: Record<string, unknown>): Promise<unknown> {
  return (fm as unknown as SendCommandAccess).sendCommand(type, payload);
}

describe("FleetManager.sendCommand transport routing", () => {
  it("routes through commandBus when only commandBus is wired", async () => {
    const fm = new FleetManager("node-1", stubStore);
    const bus = makeFakeBus();
    fm.setCommandBus(bus);

    const result = await callSendCommand(fm, "bot.start", { name: "x" });
    expect(result).toEqual({ fromBus: true });
    expect(bus.calls).toEqual([{ nodeId: "node-1", command: { type: "bot.start", payload: { name: "x" } } }]);
  });

  it("routes through operationQueue when wired (queue takes priority)", async () => {
    const fm = new FleetManager("node-1", stubStore);
    const bus = makeFakeBus();
    const queue = makeFakeQueue();
    fm.setCommandBus(bus);
    fm.setDeps({ operationQueue: queue });

    // The queue's raw return is wrapped in a CommandResult so call sites
    // see the same shape they get from the WS bus.
    const result = (await callSendCommand(fm, "bot.start", { name: "x", image: "img" })) as {
      type: string;
      command: string;
      success: boolean;
      data: unknown;
    };
    expect(result.type).toBe("command_result");
    expect(result.command).toBe("bot.start");
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ fromQueue: true });

    expect(queue.calls).toEqual([
      {
        type: "bot.start",
        target: "node-1",
        payload: { name: "x", image: "img" },
      },
    ]);
    // Bus must NOT have been touched.
    expect(bus.calls).toEqual([]);
  });

  it("targets the queue request at the FleetManager's own nodeId", async () => {
    const fm = new FleetManager("node-zeta", stubStore);
    const queue = makeFakeQueue();
    fm.setDeps({ operationQueue: queue });

    await callSendCommand(fm, "bot.stop", { name: "x" });
    expect(queue.calls[0].target).toBe("node-zeta");
  });

  it("throws when neither transport is wired", async () => {
    const fm = new FleetManager("node-1", stubStore);
    await expect(callSendCommand(fm, "bot.start", {})).rejects.toThrow(/no transport configured/);
  });

  it("queue dispatch ignores commandBus presence", async () => {
    const fm = new FleetManager("node-1", stubStore);
    const queue = makeFakeQueue();
    fm.setDeps({ operationQueue: queue });
    // Wire the bus AFTER the queue — shouldn't affect routing.
    fm.setCommandBus(makeFakeBus());

    await callSendCommand(fm, "pool.list", {});
    expect(queue.calls).toHaveLength(1);
    expect(queue.calls[0].type).toBe("pool.list");
  });
});
