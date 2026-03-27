import type Docker from "dockerode";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VolumeSnapshotManager } from "../volume-snapshot-manager.js";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 1024, mtime: new Date("2026-03-14T10:00:00Z") }),
  readdir: vi.fn().mockResolvedValue([]),
  rm: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("../../config/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { mkdir, readdir, rm, stat } from "node:fs/promises";

function mockContainer() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

function mockDocker(): Docker {
  return {
    createContainer: vi.fn().mockResolvedValue(mockContainer()),
  } as unknown as Docker;
}

describe("VolumeSnapshotManager", () => {
  let docker: Docker;
  let manager: VolumeSnapshotManager;

  beforeEach(() => {
    vi.clearAllMocks();
    docker = mockDocker();
    manager = new VolumeSnapshotManager(docker, "/data/fleet/snapshots");
  });

  describe("snapshot()", () => {
    it("creates container with correct binds and runs tar", async () => {
      await manager.snapshot("my-volume");

      expect(docker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: "alpine:latest",
          Cmd: expect.arrayContaining(["tar", "cf"]),
          HostConfig: expect.objectContaining({
            Binds: expect.arrayContaining(["my-volume:/source:ro", "/data/fleet/snapshots:/backup"]),
            AutoRemove: true,
          }),
        }),
      );

      const container = await (docker.createContainer as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(container.start).toHaveBeenCalled();
      expect(container.wait).toHaveBeenCalled();
    });

    it("returns a VolumeSnapshot with correct fields", async () => {
      const result = await manager.snapshot("my-volume");

      expect(result.volumeName).toBe("my-volume");
      expect(result.id).toMatch(/^my-volume-\d{4}-\d{2}-\d{2}T/);
      expect(result.archivePath).toMatch(/^\/data\/fleet\/snapshots\/my-volume-.*\.tar$/);
      expect(result.sizeBytes).toBe(1024);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("ensures backup directory exists", async () => {
      await manager.snapshot("my-volume");
      expect(mkdir).toHaveBeenCalledWith("/data/fleet/snapshots", { recursive: true });
    });

    it("cleans up container on start failure", async () => {
      const container = mockContainer();
      container.start.mockRejectedValue(new Error("start failed"));
      (docker.createContainer as ReturnType<typeof vi.fn>).mockResolvedValue(container);

      await expect(manager.snapshot("my-volume")).rejects.toThrow("start failed");
      expect(container.remove).toHaveBeenCalledWith({ force: true });
    });
  });

  describe("restore()", () => {
    it("creates container with correct binds and runs tar xf", async () => {
      const snapshotId = "my-volume-2026-03-14T10-00-00-000Z";
      await manager.restore(snapshotId);

      expect(docker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: "alpine:latest",
          Cmd: ["sh", "-c", `cd /target && rm -rf ./* ./.??* && tar xf /backup/${snapshotId}.tar -C /target`],
          HostConfig: expect.objectContaining({
            Binds: expect.arrayContaining(["my-volume:/target", "/data/fleet/snapshots:/backup:ro"]),
            AutoRemove: true,
          }),
        }),
      );
    });

    it("starts and waits for container", async () => {
      const container = mockContainer();
      (docker.createContainer as ReturnType<typeof vi.fn>).mockResolvedValue(container);

      await manager.restore("my-volume-2026-03-14T10-00-00-000Z");

      expect(container.start).toHaveBeenCalled();
      expect(container.wait).toHaveBeenCalled();
    });

    it("throws if archive does not exist", async () => {
      (stat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      await expect(manager.restore("nonexistent-2026-03-14T10-00-00-000Z")).rejects.toThrow("ENOENT");
    });
  });

  describe("list()", () => {
    it("returns snapshots sorted by date, newest first", async () => {
      (readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
        "my-volume-2026-03-12T08-00-00-000Z.tar",
        "my-volume-2026-03-14T10-00-00-000Z.tar",
        "my-volume-2026-03-13T09-00-00-000Z.tar",
      ]);

      const oldDate = new Date("2026-03-12T08:00:00Z");
      const midDate = new Date("2026-03-13T09:00:00Z");
      const newDate = new Date("2026-03-14T10:00:00Z");

      (stat as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ size: 100, mtime: oldDate })
        .mockResolvedValueOnce({ size: 300, mtime: newDate })
        .mockResolvedValueOnce({ size: 200, mtime: midDate });

      const result = await manager.list("my-volume");

      expect(result).toHaveLength(3);
      expect(result[0].createdAt).toEqual(newDate);
      expect(result[1].createdAt).toEqual(midDate);
      expect(result[2].createdAt).toEqual(oldDate);
    });

    it("filters to only matching volume name", async () => {
      (readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
        "my-volume-2026-03-14T10-00-00-000Z.tar",
        "other-volume-2026-03-14T10-00-00-000Z.tar",
      ]);

      const result = await manager.list("my-volume");
      expect(result).toHaveLength(1);
      expect(result[0].volumeName).toBe("my-volume");
    });

    it("returns empty array when backup dir does not exist", async () => {
      (readdir as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const result = await manager.list("my-volume");
      expect(result).toEqual([]);
    });
  });

  describe("delete()", () => {
    it("removes the archive file", async () => {
      await manager.delete("my-volume-2026-03-14T10-00-00-000Z");

      expect(rm).toHaveBeenCalledWith("/data/fleet/snapshots/my-volume-2026-03-14T10-00-00-000Z.tar", { force: true });
    });
  });

  describe("cleanup()", () => {
    it("removes old snapshots and keeps recent ones", async () => {
      const now = Date.now();
      const oldTime = new Date(now - 2 * 60 * 60 * 1000); // 2 hours ago
      const recentTime = new Date(now - 10 * 60 * 1000); // 10 minutes ago

      (readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
        "vol-2026-03-14T08-00-00-000Z.tar",
        "vol-2026-03-14T09-50-00-000Z.tar",
      ]);

      (stat as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ size: 100, mtime: oldTime })
        .mockResolvedValueOnce({ size: 200, mtime: recentTime });

      const maxAge = 60 * 60 * 1000; // 1 hour
      const deleted = await manager.cleanup(maxAge);

      expect(deleted).toBe(1);
      expect(rm).toHaveBeenCalledTimes(1);
      expect(rm).toHaveBeenCalledWith("/data/fleet/snapshots/vol-2026-03-14T08-00-00-000Z.tar", { force: true });
    });

    it("returns 0 when backup dir does not exist", async () => {
      (readdir as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

      const result = await manager.cleanup(60_000);
      expect(result).toBe(0);
    });

    it("skips non-tar files", async () => {
      (readdir as ReturnType<typeof vi.fn>).mockResolvedValue(["readme.txt", ".gitkeep"]);

      const result = await manager.cleanup(60_000);
      expect(result).toBe(0);
      expect(stat).not.toHaveBeenCalled();
    });
  });
});
