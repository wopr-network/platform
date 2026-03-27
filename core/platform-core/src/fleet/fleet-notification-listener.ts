import { logger } from "../config/logger.js";
import type { INotificationPreferencesRepository } from "../email/notification-repository-types.js";
import type { NotificationService } from "../email/notification-service.js";
import type { BotFleetEvent, FleetEventEmitter } from "./fleet-event-emitter.js";

export interface FleetNotificationListenerDeps {
  eventEmitter: FleetEventEmitter;
  notificationService: NotificationService;
  preferences: INotificationPreferencesRepository;
  /** Resolve tenant ID to owner email. Return null if no email found. */
  resolveEmail: (tenantId: string) => Promise<string | null>;
  /** Debounce window in ms before sending summary email. Default 60_000. */
  debounceMs?: number;
}

interface PendingRollout {
  tenantId: string;
  version: string;
  succeeded: number;
  failed: number;
  timer: ReturnType<typeof setTimeout>;
}

export function initFleetNotificationListener(deps: FleetNotificationListenerDeps): () => Promise<void> {
  const { eventEmitter, notificationService, preferences, resolveEmail } = deps;
  const debounceMs = deps.debounceMs ?? 60_000;
  const pending = new Map<string, PendingRollout>();

  async function flush(tenantId: string): Promise<void> {
    const rollout = pending.get(tenantId);
    if (!rollout) return;
    pending.delete(tenantId);

    try {
      const prefs = await preferences.get(tenantId);
      if (!prefs.fleet_updates) return;

      const email = await resolveEmail(tenantId);
      if (!email) {
        logger.warn("Fleet notification skipped: no email for tenant", { tenantId });
        return;
      }

      notificationService.notifyFleetUpdateComplete(
        tenantId,
        email,
        rollout.version,
        rollout.succeeded,
        rollout.failed,
      );
    } catch (err) {
      logger.error("Fleet notification flush error", { err, tenantId });
    }
  }

  const unsubscribe = eventEmitter.subscribe((event) => {
    if (!("tenantId" in event)) return;
    const botEvent = event as BotFleetEvent;
    if (botEvent.type !== "bot.updated" && botEvent.type !== "bot.update_failed") return;

    let rollout = pending.get(botEvent.tenantId);
    if (!rollout) {
      rollout = {
        tenantId: botEvent.tenantId,
        version: botEvent.version ?? "latest",
        succeeded: 0,
        failed: 0,
        timer: setTimeout(() => flush(botEvent.tenantId), debounceMs),
      };
      pending.set(botEvent.tenantId, rollout);
    } else {
      // Reset timer on each new event (sliding window)
      clearTimeout(rollout.timer);
      rollout.timer = setTimeout(() => flush(botEvent.tenantId), debounceMs);
      if (botEvent.version) rollout.version = botEvent.version;
    }

    if (botEvent.type === "bot.updated") {
      rollout.succeeded++;
    } else {
      rollout.failed++;
    }
  });

  return async () => {
    unsubscribe();
    const flushes: Promise<void>[] = [];
    for (const [tenantId, rollout] of pending) {
      clearTimeout(rollout.timer);
      flushes.push(flush(tenantId));
    }
    pending.clear();
    await Promise.allSettled(flushes);
  };
}
