/**
 * Tests for IPoolRepository interface contract.
 *
 * Uses an in-memory implementation to verify the interface
 * behavior without requiring a real database.
 */

import { describe, expect, it } from "vitest";
import { InMemoryPoolRepository } from "./in-memory-pool-repository.js";

describe("IPoolRepository (InMemory)", () => {
  it("returns default pool size of 2", async () => {
    const repo = new InMemoryPoolRepository();
    expect(await repo.getPoolSize()).toBe(2);
  });

  it("sets and gets pool size", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.setPoolSize(5);
    expect(await repo.getPoolSize()).toBe(5);
  });

  it("inserts and counts warm instances", async () => {
    const repo = new InMemoryPoolRepository();
    expect(await repo.warmCount()).toBe(0);

    await repo.insertWarm("a", "container-a", "local", "default", "img:latest");
    await repo.insertWarm("b", "container-b", "local", "default", "img:latest");

    expect(await repo.warmCount()).toBe(2);
  });

  it("lists active instances (warm + claimed)", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "container-a", "local", "default", "img:latest");
    await repo.insertWarm("b", "container-b", "local", "default", "img:latest");

    const active = await repo.listActive();
    expect(active).toHaveLength(2);
    expect(active[0].id).toBe("a");
    expect(active[0].containerId).toBe("container-a");
    expect(active[0].status).toBe("warm");

    // Claim one — it stays in listActive
    await repo.claim("default");
    const afterClaim = await repo.listActive();
    expect(afterClaim).toHaveLength(2);
    expect(afterClaim.filter((i) => i.status === "claimed")).toHaveLength(1);
    expect(afterClaim.filter((i) => i.status === "warm")).toHaveLength(1);
  });

  it("claims warm instance FIFO", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("first", "c-first", "local", "default", "img:latest");
    await repo.insertWarm("second", "c-second", "local", "default", "img:latest");

    const claimed = await repo.claim("default");
    expect(claimed).not.toBeNull();
    expect(claimed?.id).toBe("first");
    expect(claimed?.containerId).toBe("c-first");

    // Warm count drops by 1
    expect(await repo.warmCount()).toBe(1);
  });

  it("returns null when claiming from empty pool", async () => {
    const repo = new InMemoryPoolRepository();
    const result = await repo.claim("default");
    expect(result).toBeNull();
  });

  it("does not re-claim already claimed instances", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("only", "c-only", "local", "default", "img:latest");

    const first = await repo.claim("default");
    expect(first).not.toBeNull();

    const second = await repo.claim("default");
    expect(second).toBeNull();
  });

  it("marks instances dead and excludes from listActive", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a", "local", "default", "img:latest");
    await repo.markDead("a");

    expect(await repo.warmCount()).toBe(0);
    const active = await repo.listActive();
    expect(active).toHaveLength(0);
  });

  it("deletes dead instances", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a", "local", "default", "img:latest");
    await repo.insertWarm("b", "c-b", "local", "default", "img:latest");
    await repo.markDead("a");

    await repo.deleteDead();

    expect(await repo.warmCount()).toBe(1);
    const active = await repo.listActive();
    expect(active[0].id).toBe("b");
  });

  it("updates instance status", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a", "local", "default", "img:latest");
    await repo.updateInstanceStatus("a", "dead");

    expect(await repo.warmCount()).toBe(0);
  });

  it("handles multiple claims in order", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("1", "c-1", "local", "default", "img:latest");
    await repo.insertWarm("2", "c-2", "local", "default", "img:latest");
    await repo.insertWarm("3", "c-3", "local", "default", "img:latest");

    const c1 = await repo.claim("default");
    const c2 = await repo.claim("default");
    const c3 = await repo.claim("default");
    const c4 = await repo.claim("default");

    expect(c1?.id).toBe("1");
    expect(c2?.id).toBe("2");
    expect(c3?.id).toBe("3");
    expect(c4).toBeNull();
    expect(await repo.warmCount()).toBe(0);
  });

  it("dead instances are not claimable", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a", "local", "default", "img:latest");
    await repo.markDead("a");

    const result = await repo.claim("default");
    expect(result).toBeNull();
  });

  it("partitions by key", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a", "local", "alpha", "img:latest");
    await repo.insertWarm("b", "c-b", "local", "beta", "img:latest");

    expect(await repo.warmCount("alpha")).toBe(1);
    expect(await repo.warmCount("beta")).toBe(1);

    // Claim from alpha partition only
    const claimed = await repo.claim("alpha");
    expect(claimed?.id).toBe("a");

    // Beta still has its warm instance
    expect(await repo.warmCount("beta")).toBe(1);
    expect(await repo.warmCount("alpha")).toBe(0);
  });
});
