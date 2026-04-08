import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationQueue } from "../queue/operation-queue.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import { dispatchEnvUpdate } from "./dispatch-env-update.js";

function makeRepo(instance: { nodeId?: string | null; tenantId?: string } | null): IBotInstanceRepository {
  return {
    getById: vi.fn().mockResolvedValue(instance),
  } as unknown as IBotInstanceRepository;
}

function makeQueue(execute: ReturnType<typeof vi.fn>): IOperationQueue {
  return {
    execute,
    claim: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    janitorSweep: vi.fn(),
    startListener: vi.fn(),
    stopListener: vi.fn(),
    subscribeEnqueued: vi.fn(),
  } as unknown as IOperationQueue;
}

describe("dispatchEnvUpdate", () => {
  let execute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execute = vi.fn();
  });

  it("dispatches bot.update when instance has a nodeId", async () => {
    execute.mockResolvedValue(undefined);
    const repo = makeRepo({ nodeId: "node-1", tenantId: "tenant-1" });
    const queue = makeQueue(execute);

    const result = await dispatchEnvUpdate("bot-1", "tenant-1", { FOO: "bar" }, repo, queue);

    expect(result).toEqual({ dispatched: true });
    expect(execute).toHaveBeenCalledWith({
      type: "bot.update",
      target: "node-1",
      payload: { name: "tenant_tenant-1", env: { FOO: "bar" } },
    });
  });

  it("returns dispatched:false when instance has no nodeId", async () => {
    const repo = makeRepo({ nodeId: null });
    const queue = makeQueue(execute);

    const result = await dispatchEnvUpdate("bot-1", "tenant-1", {}, repo, queue);

    expect(result).toEqual({ dispatched: false, dispatchError: "bot_not_deployed" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns dispatched:false when bot instance is not found", async () => {
    const repo = makeRepo(null);
    const queue = makeQueue(execute);

    const result = await dispatchEnvUpdate("missing-bot", "tenant-1", {}, repo, queue);

    expect(result).toEqual({ dispatched: false, dispatchError: "bot_not_deployed" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns dispatched:false when operationQueue is null", async () => {
    const repo = makeRepo({ nodeId: "node-1", tenantId: "tenant-1" });

    const result = await dispatchEnvUpdate("bot-1", "tenant-1", {}, repo, null);

    expect(result).toEqual({ dispatched: false, dispatchError: "no_queue" });
  });

  it("returns dispatched:false and captures error message when execute throws", async () => {
    execute.mockRejectedValue(new Error("connection refused"));
    const repo = makeRepo({ nodeId: "node-1", tenantId: "tenant-1" });
    const queue = makeQueue(execute);

    const result = await dispatchEnvUpdate("bot-1", "tenant-1", {}, repo, queue);

    expect(result).toEqual({ dispatched: false, dispatchError: "connection refused" });
  });

  it("handles non-Error thrown values", async () => {
    execute.mockRejectedValue("string error");
    const repo = makeRepo({ nodeId: "node-1", tenantId: "tenant-1" });
    const queue = makeQueue(execute);

    const result = await dispatchEnvUpdate("bot-1", "tenant-1", {}, repo, queue);

    expect(result).toEqual({ dispatched: false, dispatchError: "string error" });
  });

  it("returns dispatched:false when tenantId does not match bot owner", async () => {
    const repo = makeRepo({ nodeId: "node-1", tenantId: "tenant-B" });
    const queue = makeQueue(execute);

    const result = await dispatchEnvUpdate("bot-1", "tenant-A", { FOO: "bar" }, repo, queue);

    expect(result).toEqual({ dispatched: false, dispatchError: "tenant_mismatch" });
    expect(execute).not.toHaveBeenCalled();
  });
});
