/**
 * Lazy-initialized DB + snapshot-manager singletons.
 *
 * This file used to be a god registry with ~40 getters wiring together every
 * fleet-era subsystem (NodeCommandBus, RecoveryOrchestrator, OrphanCleaner,
 * HeartbeatProcessor, BotBilling, DigitalOcean provisioner, …). The scorched-
 * earth deletion that followed the null-target refactor killed most of those
 * subsystems. The only surviving consumers of `fleet/services.js` are three
 * Hono routes that need `getDb` and one that needs `getSnapshotManager`.
 *
 * Everything else got deleted. This file has been trimmed to match.
 */

import { Pool } from "pg";
import { SnapshotManager } from "../backup/snapshot-manager.js";
import { DrizzleSnapshotRepository } from "../backup/snapshot-repository.js";
import { SpacesClient } from "../backup/spaces-client.js";
import { createDb, type DrizzleDb } from "../db/index.js";

const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || "/data/snapshots";
const S3_BUCKET = process.env.S3_BUCKET || "wopr-backups";

let _pool: Pool | null = null;
let _db: DrizzleDb | null = null;
let _snapshotManager: SnapshotManager | null = null;

export function initPool(connectionString: string): void {
  _pool = new Pool({ connectionString });
}

export function getPool(): Pool {
  if (!_pool) {
    throw new Error("Pool not initialized — call initPool() first");
  }
  return _pool;
}

export function getDb(): DrizzleDb {
  if (!_db) {
    _db = createDb(getPool());
  }
  return _db;
}

export function getSnapshotManager(): SnapshotManager {
  if (!_snapshotManager) {
    _snapshotManager = new SnapshotManager({
      spaces: new SpacesClient(S3_BUCKET),
      snapshotDir: SNAPSHOT_DIR,
      repo: new DrizzleSnapshotRepository(getDb()),
    });
  }
  return _snapshotManager;
}

/**
 * Reset all cached singletons. Used by tests to isolate between cases.
 */
export function resetServices(): void {
  _pool = null;
  _db = null;
  _snapshotManager = null;
}
