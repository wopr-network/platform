import { logger } from "../config/logger.js";
import type { IOperationQueue } from "../queue/operation-queue.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";

/**
 * Dispatch a bot.update operation to the node running this bot via the
 * DB-as-channel queue. Returns { dispatched: true } on success,
 * { dispatched: false, dispatchError } on failure. Never throws —
 * dispatch failure is non-fatal (DB is source of truth).
 *
 * When `operationQueue` is null the function just reports "not dispatched"
 * without touching anything. Used by tests and by products that update
 * env without a running queue worker.
 */
export async function dispatchEnvUpdate(
  botId: string,
  tenantId: string,
  env: Record<string, string>,
  botInstanceRepo: IBotInstanceRepository,
  operationQueue: IOperationQueue | null = null,
): Promise<{ dispatched: boolean; dispatchError?: string }> {
  try {
    const instance = await botInstanceRepo.getById(botId);

    if (!instance?.nodeId) {
      return { dispatched: false, dispatchError: "bot_not_deployed" };
    }

    if (instance.tenantId !== tenantId) {
      return { dispatched: false, dispatchError: "tenant_mismatch" };
    }

    if (!operationQueue) {
      return { dispatched: false, dispatchError: "no_queue" };
    }

    await operationQueue.execute({
      type: "bot.update",
      target: instance.nodeId,
      payload: {
        name: `tenant_${tenantId}`,
        env,
      },
    });

    return { dispatched: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to dispatch bot.update for ${botId}: ${message}`);
    return { dispatched: false, dispatchError: message };
  }
}
