import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type Docker from "dockerode";
import { logger } from "../config/logger.js";

export interface VolumeSnapshot {
  id: string;
  volumeName: string;
  archivePath: string;
  createdAt: Date;
  sizeBytes: number;
}

const ALPINE_IMAGE = "alpine:latest";

/** Strict validation for snapshot IDs — prevents path traversal and shell injection. */
const SNAPSHOT_ID_RE = /^[A-Za-z0-9._-]+$/;

function validateSnapshotId(snapshotId: string): void {
  if (!SNAPSHOT_ID_RE.test(snapshotId)) {
    throw new Error(`Invalid snapshot ID: ${snapshotId}`);
  }
}

/**
 * Snapshots and restores Docker named volumes using temporary alpine containers.
 * Used for nuclear rollback during fleet updates — if a container update fails,
 * we roll back both the image AND the data volumes.
 */
export class VolumeSnapshotManager {
  private readonly docker: Docker;
  private readonly backupDir: string;

  constructor(docker: Docker, backupDir = "/data/fleet/snapshots") {
    this.docker = docker;
    this.backupDir = backupDir;
  }

  /** Create a snapshot of a Docker named volume */
  async snapshot(volumeName: string): Promise<VolumeSnapshot> {
    await mkdir(this.backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = `${volumeName}-${timestamp}`;
    const archivePath = join(this.backupDir, `${id}.tar`);

    const container = await this.docker.createContainer({
      Image: ALPINE_IMAGE,
      Cmd: ["tar", "cf", `/backup/${id}.tar`, "-C", "/source", "."],
      HostConfig: {
        Binds: [`${volumeName}:/source:ro`, `${this.backupDir}:/backup`],
        AutoRemove: true,
      },
    });

    try {
      await container.start();
      const result = await container.wait();
      if (result.StatusCode !== 0) {
        throw new Error(`Snapshot container exited with code ${result.StatusCode}`);
      }
    } catch (err) {
      // AutoRemove handles cleanup, but if start failed the container may still exist
      try {
        await container.remove({ force: true });
      } catch {
        // already removed by AutoRemove
      }
      throw err;
    }

    const info = await stat(archivePath);

    const snapshot: VolumeSnapshot = {
      id,
      volumeName,
      archivePath,
      createdAt: new Date(),
      sizeBytes: info.size,
    };

    logger.info(`Volume snapshot created: ${id} (${info.size} bytes)`);
    return snapshot;
  }

  /** Restore a volume from a snapshot */
  async restore(snapshotId: string): Promise<void> {
    validateSnapshotId(snapshotId);
    const archivePath = join(this.backupDir, `${snapshotId}.tar`);

    // Verify archive exists
    await stat(archivePath);

    // Extract volume name from snapshot ID (everything before the last ISO timestamp)
    const volumeName = this.extractVolumeName(snapshotId);

    const container = await this.docker.createContainer({
      Image: ALPINE_IMAGE,
      Cmd: ["sh", "-c", `cd /target && rm -rf ./* ./.??* && tar xf /backup/${snapshotId}.tar -C /target`],
      HostConfig: {
        Binds: [`${volumeName}:/target`, `${this.backupDir}:/backup:ro`],
        AutoRemove: true,
      },
    });

    try {
      await container.start();
      const result = await container.wait();
      if (result.StatusCode !== 0) {
        throw new Error(`Restore container exited with code ${result.StatusCode}`);
      }
    } catch (err) {
      try {
        await container.remove({ force: true });
      } catch {
        // already removed by AutoRemove
      }
      throw err;
    }

    logger.info(`Volume restored from snapshot: ${snapshotId}`);
  }

  /** List all snapshots for a volume */
  async list(volumeName: string): Promise<VolumeSnapshot[]> {
    let files: string[];
    try {
      files = await readdir(this.backupDir);
    } catch {
      return [];
    }

    const prefix = `${volumeName}-`;
    const matching = files.filter((f) => f.startsWith(prefix) && f.endsWith(".tar"));

    const snapshots: VolumeSnapshot[] = [];
    for (const file of matching) {
      const id = file.replace(/\.tar$/, "");
      const archivePath = join(this.backupDir, file);
      try {
        const info = await stat(archivePath);
        snapshots.push({
          id,
          volumeName,
          archivePath,
          createdAt: info.mtime,
          sizeBytes: info.size,
        });
      } catch {
        // File disappeared between readdir and stat — skip
      }
    }

    // Sort newest first
    snapshots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return snapshots;
  }

  /** Delete a snapshot archive */
  async delete(snapshotId: string): Promise<void> {
    validateSnapshotId(snapshotId);
    const archivePath = join(this.backupDir, `${snapshotId}.tar`);
    await rm(archivePath, { force: true });
    logger.info(`Volume snapshot deleted: ${snapshotId}`);
  }

  /** Delete all snapshots older than maxAge ms */
  async cleanup(maxAgeMs: number): Promise<number> {
    let files: string[];
    try {
      files = await readdir(this.backupDir);
    } catch {
      return 0;
    }

    const cutoff = Date.now() - maxAgeMs;
    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith(".tar")) continue;
      const archivePath = join(this.backupDir, file);
      try {
        const info = await stat(archivePath);
        if (info.mtime.getTime() < cutoff) {
          await rm(archivePath, { force: true });
          deleted++;
        }
      } catch {
        // File disappeared — skip
      }
    }

    if (deleted > 0) {
      logger.info(`Volume snapshot cleanup: removed ${deleted} old snapshots`);
    }
    return deleted;
  }

  /**
   * Extract volume name from snapshot ID.
   * Snapshot IDs are `${volumeName}-${ISO timestamp with colons/dots replaced}`.
   * ISO timestamps start with 4 digits (year), so we find the last occurrence
   * of `-YYYY` pattern to split.
   */
  private extractVolumeName(snapshotId: string): string {
    // Match the timestamp part: -YYYY-MM-DDTHH-MM-SS-MMMZ
    const match = snapshotId.match(/^(.+)-\d{4}-\d{2}-\d{2}T/);
    if (!match) {
      throw new Error(`Cannot extract volume name from snapshot ID: ${snapshotId}`);
    }
    return match[1];
  }
}
