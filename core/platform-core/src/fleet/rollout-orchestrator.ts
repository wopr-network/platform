/**
 * RolloutOrchestrator — coordinates fleet-wide container updates using
 * pluggable rollout strategies and volume snapshots for nuclear rollback.
 *
 * Sits between ImagePoller (detects new digests) and ContainerUpdater
 * (handles per-bot pull/stop/recreate/health). Adds:
 * - Strategy-driven batching (rolling wave, single bot, immediate)
 * - Pre-update volume snapshots via VolumeSnapshotManager
 * - Volume restore on health check failure (nuclear rollback)
 * - Per-tenant update orchestration
 */

import { logger } from "../config/logger.js";
import type { IRolloutStrategy } from "./rollout-strategy.js";
import type { BotProfile } from "./types.js";
import type { ContainerUpdater, UpdateResult } from "./updater.js";
import type { VolumeSnapshotManager } from "./volume-snapshot-manager.js";

export interface RolloutOrchestratorDeps {
  updater: ContainerUpdater;
  snapshotManager: VolumeSnapshotManager;
  strategy: IRolloutStrategy;
  /** Resolve running profiles that need updating for a given image digest */
  getUpdatableProfiles: () => Promise<BotProfile[]>;
  /** Optional callback after each bot update (success or failure) */
  onBotUpdated?: (result: UpdateResult & { volumeRestored: boolean }) => void;
  /** Optional callback when a rollout completes */
  onRolloutComplete?: (results: RolloutResult) => void;
}

export interface BotUpdateResult extends UpdateResult {
  volumeRestored: boolean;
}

export interface RolloutResult {
  totalBots: number;
  succeeded: number;
  failed: number;
  skipped: number;
  aborted: boolean;
  /** True when a concurrent rollout was already in progress */
  alreadyRunning: boolean;
  results: BotUpdateResult[];
}

export class RolloutOrchestrator {
  private readonly updater: ContainerUpdater;
  private readonly snapshotManager: VolumeSnapshotManager;
  private readonly strategy: IRolloutStrategy;
  private readonly getUpdatableProfiles: () => Promise<BotProfile[]>;
  private readonly onBotUpdated?: (result: BotUpdateResult) => void;
  private readonly onRolloutComplete?: (results: RolloutResult) => void;
  private rolling = false;

  constructor(deps: RolloutOrchestratorDeps) {
    this.updater = deps.updater;
    this.snapshotManager = deps.snapshotManager;
    this.strategy = deps.strategy;
    this.getUpdatableProfiles = deps.getUpdatableProfiles;
    this.onBotUpdated = deps.onBotUpdated;
    this.onRolloutComplete = deps.onRolloutComplete;
  }

  /** Whether a rollout is currently in progress. */
  get isRolling(): boolean {
    return this.rolling;
  }

  /**
   * Execute a rollout across all updatable bots.
   * Uses the configured strategy for batching, pausing, and failure handling.
   */
  async rollout(): Promise<RolloutResult> {
    if (this.rolling) {
      logger.warn("Rollout already in progress — skipping");
      return { totalBots: 0, succeeded: 0, failed: 0, skipped: 0, aborted: false, alreadyRunning: true, results: [] };
    }

    this.rolling = true;
    const allResults: BotUpdateResult[] = [];
    let aborted = false;

    try {
      let remaining = await this.getUpdatableProfiles();
      const totalBots = remaining.length;

      if (totalBots === 0) {
        logger.info("Rollout: no bots to update");
        return {
          totalBots: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          aborted: false,
          alreadyRunning: false,
          results: [],
        };
      }

      logger.info(`Rollout starting: ${totalBots} bots to update`);

      while (remaining.length > 0 && !aborted) {
        const batch = this.strategy.nextBatch(remaining);
        if (batch.length === 0) break;

        logger.info(`Rollout wave: ${batch.length} bots (${remaining.length} remaining)`);

        // Process batch — each bot sequentially within a wave for safety
        const retryProfiles: BotProfile[] = [];
        for (const profile of batch) {
          if (aborted) break;

          const result = await this.updateBot(profile);
          allResults.push(result);
          this.onBotUpdated?.(result);

          if (!result.success) {
            const action = this.handleFailure(profile.id, result, allResults);
            if (action === "abort") {
              aborted = true;
              logger.warn(`Rollout aborted after bot ${profile.id} failure`);
            } else if (action === "retry") {
              retryProfiles.push(profile);
            }
            // "skip" → don't re-add, bot is dropped
          }
        }

        // Remove processed bots from remaining, but re-add retries
        const processedIds = new Set(batch.map((b) => b.id));
        const retryIds = new Set(retryProfiles.map((b) => b.id));
        remaining = [
          ...remaining.filter((b) => !processedIds.has(b.id)),
          ...retryProfiles.filter((b) => retryIds.has(b.id)),
        ];

        // Pause between waves (unless aborted or done)
        if (remaining.length > 0 && !aborted) {
          const pause = this.strategy.pauseDuration();
          if (pause > 0) {
            logger.info(`Rollout: pausing ${pause}ms before next wave`);
            await sleep(pause);
          }
        }
      }

      const succeeded = allResults.filter((r) => r.success).length;
      const failed = allResults.filter((r) => !r.success).length;
      const skipped = totalBots - allResults.length;

      const rolloutResult: RolloutResult = {
        totalBots,
        succeeded,
        failed,
        skipped,
        aborted,
        alreadyRunning: false,
        results: allResults,
      };

      logger.info(`Rollout complete: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped, aborted=${aborted}`);
      this.onRolloutComplete?.(rolloutResult);

      return rolloutResult;
    } finally {
      this.rolling = false;
    }
  }

  /**
   * Update a single bot with volume snapshot + nuclear rollback.
   */
  private async updateBot(profile: BotProfile): Promise<BotUpdateResult> {
    const snapshotIds: string[] = [];

    try {
      // Step 1: Snapshot volumes before update
      if (profile.volumeName) {
        try {
          const snap = await this.snapshotManager.snapshot(profile.volumeName);
          snapshotIds.push(snap.id);
          logger.info(`Pre-update snapshot for ${profile.id}: ${snap.id}`);
        } catch (err) {
          logger.warn(`Volume snapshot failed for ${profile.id} — proceeding without backup`, { err });
        }
      }

      // Step 2: Delegate to ContainerUpdater
      const result = await this.updater.updateBot(profile.id);

      if (result.success) {
        // Clean up snapshots on success
        await this.cleanupSnapshots(snapshotIds);
        return { ...result, volumeRestored: false };
      }

      // Step 3: Nuclear rollback — restore volumes if update failed
      const volumeRestored = await this.restoreVolumes(profile.id, snapshotIds);
      return { ...result, volumeRestored };
    } catch (err) {
      logger.error(`Unexpected error updating bot ${profile.id}`, { err });

      // Attempt volume restore on unexpected errors too
      const volumeRestored = await this.restoreVolumes(profile.id, snapshotIds);

      return {
        botId: profile.id,
        success: false,
        previousImage: profile.image,
        newImage: profile.image,
        previousDigest: null,
        newDigest: null,
        rolledBack: false,
        volumeRestored,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Handle a bot failure using the strategy's failure policy.
   * Retries the update up to maxRetries before escalating.
   */
  private handleFailure(
    botId: string,
    result: BotUpdateResult,
    allResults: BotUpdateResult[],
  ): "abort" | "skip" | "retry" {
    const error = new Error(result.error ?? "Unknown error");
    const failCount = allResults.filter((r) => r.botId === botId && !r.success).length;
    return this.strategy.onBotFailure(botId, error, failCount);
  }

  private async restoreVolumes(botId: string, snapshotIds: string[]): Promise<boolean> {
    if (snapshotIds.length === 0) return false;

    for (const id of snapshotIds) {
      try {
        await this.snapshotManager.restore(id);
        logger.info(`Volume restored for ${botId} from snapshot ${id}`);
        return true;
      } catch (err) {
        logger.error(`Volume restore failed for ${botId} snapshot ${id}`, { err });
      }
    }
    return false;
  }

  private async cleanupSnapshots(snapshotIds: string[]): Promise<void> {
    for (const id of snapshotIds) {
      try {
        await this.snapshotManager.delete(id);
      } catch (err) {
        logger.warn(`Failed to clean up snapshot ${id}`, { err });
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
