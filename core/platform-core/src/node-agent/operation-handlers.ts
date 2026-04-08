/**
 * Agent operation handlers — the single source of truth for what each
 * agent-side command does.
 *
 * Both transports use this map:
 *   - WebSocket dispatch (legacy bus, in NodeAgent.dispatch)
 *   - DB-as-channel queue worker (AgentWorker, drains pending_operations
 *     rows targeted at this agent's node id)
 *
 * Keeping the bodies in one place ensures the two transports never diverge.
 * Adding a new operation means adding it here once; both paths pick it up.
 *
 * See `docs/2026-04-08-db-queue-architecture.md` §8.
 */

import type { OperationHandler } from "../queue/queue-worker.js";
import type { BackupManager, HotBackupScheduler } from "./backup.js";
import type { DockerManager } from "./docker.js";

/**
 * Factory dependencies. The agent's main file constructs the managers, then
 * passes them here to build a fresh handler map per worker instance.
 */
export interface AgentOperationDeps {
  dockerManager: DockerManager;
  backupManager: BackupManager;
  hotBackupScheduler: HotBackupScheduler;
  backupDir: string;
}

/**
 * Construct the full operation handler map for an agent. The keys match the
 * `pending_operations.type` values core uses when enqueueing for this node,
 * and the same string set the legacy WebSocket bus uses for `command.type`.
 */
export function buildAgentOperationHandlers(deps: AgentOperationDeps): Map<string, OperationHandler> {
  const { dockerManager, backupManager, hotBackupScheduler, backupDir } = deps;
  const handlers = new Map<string, OperationHandler>();

  handlers.set("bot.start", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.startBot({
      name: String(p.name),
      image: String(p.image),
      env: parseJsonOrObject(p.env),
      restart: p.restart != null ? String(p.restart) : undefined,
    });
  });

  handlers.set("bot.stop", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.stopBot(String(p.name));
  });

  handlers.set("bot.restart", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.restartBot(String(p.name));
  });

  handlers.set("bot.update", async (payload) => {
    const p = asRecord(payload);
    // Two modes: rename a pool container into a tenant container, or update env.
    if (p.rename === true && p.containerId) {
      return await dockerManager.renameContainer(String(p.containerId), String(p.name));
    }
    return await dockerManager.updateBot({
      name: String(p.name),
      env: parseJsonOrObject(p.env) ?? {},
    });
  });

  handlers.set("bot.export", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.exportBot(String(p.name), backupDir);
  });

  handlers.set("bot.import", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.importBot(String(p.name), backupDir, String(p.image), parseJsonOrObject(p.env));
  });

  handlers.set("bot.remove", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.removeBot(String(p.name));
  });

  handlers.set("bot.logs", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.getLogs(String(p.name), p.tail ? Number.parseInt(String(p.tail), 10) : 100);
  });

  handlers.set("bot.inspect", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.inspectBot(String(p.name));
  });

  handlers.set("backup.upload", async (payload) => {
    const p = asRecord(payload);
    return await backupManager.upload(String(p.filename));
  });

  handlers.set("backup.download", async (payload) => {
    const p = asRecord(payload);
    return await backupManager.download(String(p.filename));
  });

  handlers.set("backup.run-nightly", async () => {
    return await backupManager.runNightly();
  });

  handlers.set("backup.run-hot", async () => {
    return await hotBackupScheduler.runHotBackup();
  });

  handlers.set("pool.warm", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.createWarmContainer({
      name: String(p.name),
      image: String(p.image),
      port: p.port ? Number(p.port) : 3100,
      network: p.network ? String(p.network) : "platform-overlay",
      provisionSecret: p.provisionSecret ? String(p.provisionSecret) : undefined,
      registryAuth: p.registryAuth
        ? (p.registryAuth as { username: string; password: string; serveraddress: string })
        : undefined,
    });
  });

  handlers.set("pool.cleanup", async (payload) => {
    const p = asRecord(payload);
    return await dockerManager.removeBot(String(p.name));
  });

  handlers.set("pool.list", async () => {
    return await dockerManager.listPoolContainers();
  });

  return handlers;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

/** Parse a value that may be a JSON string or already an object. */
export function parseJsonOrObject(value: unknown): Record<string, string> | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return JSON.parse(value) as Record<string, string>;
  if (typeof value === "object") return value as Record<string, string>;
  return undefined;
}
