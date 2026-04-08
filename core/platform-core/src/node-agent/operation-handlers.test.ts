/**
 * Verifies the agent's operation handler map covers every command the WS
 * dispatch used to handle, and that each handler routes to the right
 * DockerManager / BackupManager method.
 *
 * Each handler runs against a stub DockerManager / BackupManager that records
 * its calls — so we can assert exactly which method was invoked with which
 * arguments without involving Docker or AWS.
 */

import { describe, expect, it } from "vitest";
import type { BackupManager, HotBackupScheduler } from "./backup.js";
import type { DockerManager } from "./docker.js";
import { buildAgentOperationHandlers, parseJsonOrObject } from "./operation-handlers.js";
import { ALLOWED_COMMANDS } from "./types.js";

interface RecordedCall {
  method: string;
  args: unknown[];
}

function makeRecorder(): {
  calls: RecordedCall[];
  proxy<T extends object>(name: string): T;
} {
  const calls: RecordedCall[] = [];
  return {
    calls,
    proxy<T extends object>(_name: string): T {
      return new Proxy({} as T, {
        get(_target, prop) {
          if (typeof prop !== "string") return undefined;
          return async (...args: unknown[]) => {
            calls.push({ method: prop, args });
            return { ok: true, prop };
          };
        },
      });
    },
  };
}

function makeHandlers(agentNodeId = "node-test") {
  const recorder = makeRecorder();
  const handlers = buildAgentOperationHandlers({
    dockerManager: recorder.proxy<DockerManager>("docker"),
    backupManager: recorder.proxy<BackupManager>("backup"),
    hotBackupScheduler: recorder.proxy<HotBackupScheduler>("hotBackup"),
    backupDir: "/test/backups",
    getAgentNodeId: () => agentNodeId,
  });
  return { handlers, calls: recorder.calls };
}

describe("buildAgentOperationHandlers", () => {
  it("registers a handler for every command in ALLOWED_COMMANDS", () => {
    const { handlers } = makeHandlers();
    for (const cmd of ALLOWED_COMMANDS) {
      expect(handlers.has(cmd), `missing handler for ${cmd}`).toBe(true);
    }
  });

  it("does not register handlers for unknown commands", () => {
    const { handlers } = makeHandlers();
    for (const key of handlers.keys()) {
      expect((ALLOWED_COMMANDS as readonly string[]).includes(key), `unexpected handler ${key}`).toBe(true);
    }
  });

  it("bot.start invokes DockerManager.startBot with normalised payload", async () => {
    const { handlers, calls } = makeHandlers();
    const handler = handlers.get("bot.start");
    if (!handler) throw new Error("missing handler");
    await handler({
      name: "bot-1",
      image: "test:latest",
      env: { FOO: "bar" },
      restart: "unless-stopped",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("startBot");
    expect(calls[0].args[0]).toEqual({
      name: "bot-1",
      image: "test:latest",
      env: { FOO: "bar" },
      restart: "unless-stopped",
    });
  });

  it("bot.start stamps the agent's nodeId into the result (null-target dispatch)", async () => {
    const { handlers } = makeHandlers("node-42");
    const handler = handlers.get("bot.start");
    if (!handler) throw new Error("missing handler");
    const result = (await handler({
      name: "bot-1",
      image: "test:latest",
    })) as { nodeId?: string };
    expect(result.nodeId).toBe("node-42");
  });

  it("pool.warm stamps the agent's nodeId into the result", async () => {
    const { handlers } = makeHandlers("node-42");
    const handler = handlers.get("pool.warm");
    if (!handler) throw new Error("missing handler");
    const result = (await handler({
      name: "warm-1",
      image: "img:1",
    })) as { nodeId?: string };
    expect(result.nodeId).toBe("node-42");
  });

  it("bot.update routes to renameContainer when rename=true", async () => {
    const { handlers, calls } = makeHandlers();
    const handler = handlers.get("bot.update");
    if (!handler) throw new Error("missing handler");
    await handler({ rename: true, containerId: "abc", name: "newName" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("renameContainer");
    expect(calls[0].args).toEqual(["abc", "newName"]);
  });

  it("bot.update routes to updateBot when rename is absent", async () => {
    const { handlers, calls } = makeHandlers();
    const handler = handlers.get("bot.update");
    if (!handler) throw new Error("missing handler");
    await handler({ name: "bot-1", env: { X: "y" } });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("updateBot");
    expect(calls[0].args[0]).toEqual({ name: "bot-1", env: { X: "y" } });
  });

  it("backup.run-nightly routes to BackupManager.runNightly with no args", async () => {
    const { handlers, calls } = makeHandlers();
    const handler = handlers.get("backup.run-nightly");
    if (!handler) throw new Error("missing handler");
    await handler({});
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("runNightly");
    expect(calls[0].args).toEqual([]);
  });

  it("backup.run-hot routes to HotBackupScheduler.runHotBackup", async () => {
    const { handlers, calls } = makeHandlers();
    const handler = handlers.get("backup.run-hot");
    if (!handler) throw new Error("missing handler");
    await handler({});
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("runHotBackup");
  });

  it("pool.warm normalises optional fields with defaults", async () => {
    const { handlers, calls } = makeHandlers();
    const handler = handlers.get("pool.warm");
    if (!handler) throw new Error("missing handler");
    await handler({ name: "warm-1", image: "img:1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("createWarmContainer");
    expect(calls[0].args[0]).toMatchObject({
      name: "warm-1",
      image: "img:1",
      port: 3100,
      network: "platform-overlay",
    });
  });

  it("bot.export passes the configured backupDir", async () => {
    const { handlers, calls } = makeHandlers();
    const handler = handlers.get("bot.export");
    if (!handler) throw new Error("missing handler");
    await handler({ name: "bot-1" });
    expect(calls[0].method).toBe("exportBot");
    expect(calls[0].args).toEqual(["bot-1", "/test/backups"]);
  });
});

describe("parseJsonOrObject", () => {
  it("returns undefined for null/undefined", () => {
    expect(parseJsonOrObject(null)).toBeUndefined();
    expect(parseJsonOrObject(undefined)).toBeUndefined();
  });

  it("parses a JSON string", () => {
    expect(parseJsonOrObject('{"a":"1"}')).toEqual({ a: "1" });
  });

  it("returns an object as-is", () => {
    const obj = { foo: "bar" };
    expect(parseJsonOrObject(obj)).toBe(obj);
  });

  it("returns undefined for non-string non-object", () => {
    expect(parseJsonOrObject(42)).toBeUndefined();
  });
});
