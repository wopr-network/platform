/**
 * Tests for hot pool service functions (getPoolSize, setPoolSize).
 *
 * Uses InMemoryPoolRepository to test service logic without Docker or DB.
 */

import { describe, expect, it } from "vitest";
import { getPoolSize, setPoolSize } from "../hot-pool.js";
import { InMemoryPoolRepository } from "./in-memory-pool-repository.js";

describe("hot pool service", () => {
  describe("getPoolSize / setPoolSize", () => {
    it("returns default pool size", async () => {
      const repo = new InMemoryPoolRepository();
      expect(await getPoolSize(repo)).toBe(2);
    });

    it("sets and reads pool size", async () => {
      const repo = new InMemoryPoolRepository();
      await setPoolSize(repo, 10);
      expect(await getPoolSize(repo)).toBe(10);
    });

    it("pool size of 0 is valid", async () => {
      const repo = new InMemoryPoolRepository();
      await setPoolSize(repo, 0);
      expect(await getPoolSize(repo)).toBe(0);
    });
  });
});
