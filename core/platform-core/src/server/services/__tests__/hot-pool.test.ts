/**
 * Tests for HotPool class.
 *
 * Uses InMemoryPoolRepository — no Docker or DB required.
 */

import { describe, expect, it } from "vitest";
import { HotPool } from "../hot-pool.js";
import { InMemoryPoolRepository } from "./in-memory-pool-repository.js";

/** Minimal mock Docker that satisfies the HotPool constructor. */
const mockDocker = {} as import("dockerode");

function createPool(repo?: InMemoryPoolRepository) {
  const r = repo ?? new InMemoryPoolRepository();
  const pool = new HotPool(mockDocker, r, { provisionSecret: "test-secret" });
  return { pool, repo: r };
}

describe("HotPool", () => {
  describe("register / registeredKeys", () => {
    it("tracks registered specs", () => {
      const { pool } = createPool();
      pool.register("alpha", { image: "img-a:latest", port: 3000, network: "net", size: 2 });
      pool.register("beta", { image: "img-b:latest", port: 3100, network: "net", size: 3 });

      expect(pool.registeredKeys()).toEqual(["alpha", "beta"]);
    });
  });

  describe("size / resize", () => {
    it("returns registered size", () => {
      const { pool } = createPool();
      pool.register("alpha", { image: "img:latest", port: 3000, network: "net", size: 5 });

      expect(pool.size("alpha")).toBe(5);
    });

    it("returns 0 for unknown key", () => {
      const { pool } = createPool();
      expect(pool.size("unknown")).toBe(0);
    });

    it("resize updates in-memory size", async () => {
      const { pool } = createPool();
      pool.register("alpha", { image: "img:latest", port: 3000, network: "net", size: 2 });

      await pool.resize("alpha", 10);
      expect(pool.size("alpha")).toBe(10);
    });
  });

  describe("claim", () => {
    it("claims a warm instance from the right partition", async () => {
      const repo = new InMemoryPoolRepository();
      await repo.insertWarm("a1", "c-a1", "alpha");
      await repo.insertWarm("b1", "c-b1", "beta");

      const { pool } = createPool(repo);
      pool.register("alpha", { image: "img:latest", port: 3000, network: "net", size: 1 });

      const claimed = await pool.claim("alpha");
      expect(claimed).not.toBeNull();
      expect(claimed?.id).toBe("a1");

      // Beta partition untouched
      expect(await repo.warmCount("beta")).toBe(1);
    });

    it("returns null when partition is empty", async () => {
      const { pool } = createPool();
      pool.register("alpha", { image: "img:latest", port: 3000, network: "net", size: 1 });

      const result = await pool.claim("alpha");
      expect(result).toBeNull();
    });
  });
});
