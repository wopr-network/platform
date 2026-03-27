/**
 * Wires the fleet auto-update pipeline: ImagePoller → RolloutOrchestrator → ContainerUpdater.
 *
 * Consumers call initFleetUpdater() with a Docker instance, FleetManager, and config.
 * The pipeline detects new image digests, batches updates via a rollout strategy,
 * snapshots volumes before updating, and restores on failure (nuclear rollback).
 *
 * When a new image digest is detected for ANY bot, the orchestrator triggers a
 * fleet-wide rollout across all non-manual bots. This is intentional: the managed
 * Paperclip image is shared across all tenants, so a single digest change means
 * all bots need updating.
 */

import type Docker from "dockerode";
import { logger } from "../config/logger.js";
import type { IBotProfileRepository } from "./bot-profile-repository.js";
import { FleetEventEmitter } from "./fleet-event-emitter.js";
import type { FleetManager } from "./fleet-manager.js";
import { ImagePoller } from "./image-poller.js";
import type { IProfileStore } from "./profile-store.js";
import { RolloutOrchestrator, type RolloutResult } from "./rollout-orchestrator.js";
import { createRolloutStrategy, type RollingWaveOptions } from "./rollout-strategy.js";
import type { ITenantUpdateConfigRepository } from "./tenant-update-config-repository.js";
import { ContainerUpdater } from "./updater.js";
import { VolumeSnapshotManager } from "./volume-snapshot-manager.js";

export interface FleetUpdaterConfig {
  /** Rollout strategy type. Default: "rolling-wave" */
  strategy?: "rolling-wave" | "single-bot" | "immediate";
  /** Options for RollingWaveStrategy (ignored for other strategies) */
  strategyOptions?: RollingWaveOptions;
  /** Directory for volume snapshots. Default: "/data/fleet/snapshots" */
  snapshotDir?: string;
  /** Called after each bot update */
  onBotUpdated?: (result: { botId: string; success: boolean; volumeRestored: boolean }) => void;
  /** Called when a rollout completes */
  onRolloutComplete?: (result: RolloutResult) => void;
  /** Optional per-tenant update config repository. When provided, tenants with mode=manual are excluded. */
  configRepo?: ITenantUpdateConfigRepository;
  /** Optional fleet event emitter. When provided, bot.updated / bot.update_failed events are emitted. */
  eventEmitter?: FleetEventEmitter;
  /** Called with manual-mode tenant IDs when a new image is available but they are excluded from rollout. */
  onManualTenantsSkipped?: (tenantIds: string[], imageTag: string) => void;
}

export interface FleetUpdaterHandle {
  poller: ImagePoller;
  updater: ContainerUpdater;
  orchestrator: RolloutOrchestrator;
  snapshotManager: VolumeSnapshotManager;
  /** Fleet event emitter for subscribing to bot/node lifecycle events */
  eventEmitter: FleetEventEmitter;
  /** Stop the poller and wait for any active rollout to finish */
  stop: () => Promise<void>;
}

/**
 * Initialize the fleet auto-update pipeline.
 *
 * Creates and wires: ImagePoller → RolloutOrchestrator → ContainerUpdater
 * with VolumeSnapshotManager for nuclear rollback.
 *
 * @param docker - Dockerode instance for container operations
 * @param fleet - FleetManager for container lifecycle
 * @param profileStore - Legacy IProfileStore (used by ImagePoller/ContainerUpdater)
 * @param profileRepo - PostgreSQL-backed IBotProfileRepository (used for updatable profile queries)
 * @param config - Optional pipeline configuration
 */
export function initFleetUpdater(
  docker: Docker,
  fleet: FleetManager,
  profileStore: IProfileStore,
  profileRepo: IBotProfileRepository,
  config: FleetUpdaterConfig = {},
): FleetUpdaterHandle {
  const {
    strategy: strategyType = "rolling-wave",
    strategyOptions,
    snapshotDir = "/data/fleet/snapshots",
    onBotUpdated,
    onRolloutComplete,
    configRepo,
    eventEmitter: configEventEmitter,
    onManualTenantsSkipped,
  } = config;

  const emitter = configEventEmitter ?? new FleetEventEmitter();

  const poller = new ImagePoller(docker, profileStore);
  const updater = new ContainerUpdater(docker, profileStore, fleet, poller);
  const snapshotManager = new VolumeSnapshotManager(docker, snapshotDir);
  const strategy = createRolloutStrategy(strategyType, strategyOptions);

  // Captured by the onUpdateAvailable handler and read by getUpdatableProfiles.
  // Set before each orchestrator.rollout() call so the callback receives the
  // image tag that triggered this rollout rather than a stale "latest" placeholder.
  let currentImageTag = "latest";

  const orchestrator = new RolloutOrchestrator({
    updater,
    snapshotManager,
    strategy,
    getUpdatableProfiles: async () => {
      const profiles = await profileRepo.list();

      // Separate profiles by updatePolicy
      const manualPolicyIds: string[] = [];
      const nonManualPolicy = profiles.filter((p) => {
        if (p.updatePolicy === "manual") {
          manualPolicyIds.push(p.tenantId);
          return false;
        }
        return true;
      });

      if (!configRepo) {
        if (manualPolicyIds.length > 0 && onManualTenantsSkipped) {
          onManualTenantsSkipped([...new Set(manualPolicyIds)], currentImageTag);
        }
        return nonManualPolicy;
      }

      // Filter out tenants whose per-tenant config is set to manual
      const configManualIds: string[] = [];
      const results = await Promise.all(
        nonManualPolicy.map(async (p) => {
          const tenantCfg = await configRepo.get(p.tenantId);
          // If tenant has an explicit config with mode=manual, exclude
          if (tenantCfg && tenantCfg.mode === "manual") {
            configManualIds.push(p.tenantId);
            return null;
          }
          return p;
        }),
      );

      const allManualIds = [...manualPolicyIds, ...configManualIds];
      if (allManualIds.length > 0 && onManualTenantsSkipped) {
        onManualTenantsSkipped([...new Set(allManualIds)], currentImageTag);
      }

      return results.filter((p) => p !== null);
    },
    onBotUpdated: (result) => {
      // Fire-and-forget: resolve tenantId + emit event asynchronously
      // The orchestrator callback is sync (void return) — async work must not block rollout progress
      void (async () => {
        let tenantId = "";
        try {
          const profile = await profileRepo.get(result.botId);
          if (profile) tenantId = profile.tenantId;
        } catch {
          // Best-effort — event still fires with empty tenantId
        }

        // Extract version tag from image name (e.g. "ghcr.io/org/image:v1.2.3" → "v1.2.3")
        const version = result.newImage.includes(":") ? (result.newImage.split(":").pop() ?? "latest") : "latest";

        emitter.emit({
          type: result.success ? "bot.updated" : "bot.update_failed",
          botId: result.botId,
          tenantId,
          timestamp: new Date().toISOString(),
          version,
        });
      })();
      onBotUpdated?.(result);
    },
    onRolloutComplete: (result) => {
      onRolloutComplete?.(result);
    },
  });

  // Wire the detection → orchestration pipeline.
  // Any digest change triggers a fleet-wide rollout because the managed image
  // is shared across all tenants — one new digest means all bots need updating.
  poller.onUpdateAvailable = async (botId: string, _newDigest: string) => {
    if (orchestrator.isRolling) {
      logger.debug("Skipping update trigger — rollout already in progress");
      return;
    }

    // Resolve the image tag from the bot that triggered the update so that
    // onManualTenantsSkipped receives the real version instead of "latest".
    try {
      const triggeringProfile = await profileStore.get(botId);
      if (triggeringProfile) {
        const img = triggeringProfile.image;
        currentImageTag = img.includes(":") ? (img.split(":").pop() ?? "latest") : "latest";
      }
    } catch {
      // Best-effort — currentImageTag stays at previous value
    }

    logger.info("New image digest detected — starting fleet-wide rollout");
    await orchestrator.rollout().catch((err) => {
      logger.error("Rollout failed", { err });
    });
  };

  // Start polling
  poller.start().catch((err) => {
    logger.error("ImagePoller failed to start", { err });
  });

  logger.info("Fleet auto-update pipeline initialized", {
    strategy: strategyType,
    snapshotDir,
  });

  return {
    poller,
    updater,
    orchestrator,
    snapshotManager,
    eventEmitter: emitter,
    stop: async () => {
      poller.stop();
      // Wait for any in-flight rollout to complete before returning
      if (orchestrator.isRolling) {
        logger.info("Waiting for active rollout to finish before shutdown...");
        // Poll until rollout finishes (max 5 minutes)
        const deadline = Date.now() + 5 * 60 * 1000;
        while (orchestrator.isRolling && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      logger.info("Fleet auto-update pipeline stopped");
    },
  };
}
