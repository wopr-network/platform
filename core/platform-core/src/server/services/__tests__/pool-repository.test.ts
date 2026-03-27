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

    await repo.insertWarm("a", "container-a");
    await repo.insertWarm("b", "container-b");

    expect(await repo.warmCount()).toBe(2);
  });

  it("lists warm instances", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "container-a");
    await repo.insertWarm("b", "container-b");

    const warm = await repo.listWarm();
    expect(warm).toHaveLength(2);
    expect(warm[0].id).toBe("a");
    expect(warm[0].containerId).toBe("container-a");
    expect(warm[0].status).toBe("warm");
  });

  it("claims warm instance FIFO", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("first", "c-first");
    await repo.insertWarm("second", "c-second");

    const claimed = await repo.claimWarm("tenant-1", "my-bot");
    expect(claimed).not.toBeNull();
    expect(claimed?.id).toBe("first");
    expect(claimed?.containerId).toBe("c-first");

    // Warm count drops by 1
    expect(await repo.warmCount()).toBe(1);
  });

  it("returns null when claiming from empty pool", async () => {
    const repo = new InMemoryPoolRepository();
    const result = await repo.claimWarm("tenant-1", "bot");
    expect(result).toBeNull();
  });

  it("does not re-claim already claimed instances", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("only", "c-only");

    const first = await repo.claimWarm("t1", "bot1");
    expect(first).not.toBeNull();

    const second = await repo.claimWarm("t2", "bot2");
    expect(second).toBeNull();
  });

  it("marks instances dead", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a");
    await repo.markDead("a");

    expect(await repo.warmCount()).toBe(0);
    const warm = await repo.listWarm();
    expect(warm).toHaveLength(0);
  });

  it("deletes dead instances", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a");
    await repo.insertWarm("b", "c-b");
    await repo.markDead("a");

    await repo.deleteDead();

    // Only 'b' remains (warm)
    expect(await repo.warmCount()).toBe(1);
    const warm = await repo.listWarm();
    expect(warm[0].id).toBe("b");
  });

  it("updates instance status", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a");
    await repo.updateInstanceStatus("a", "provisioning");

    // No longer warm
    expect(await repo.warmCount()).toBe(0);
  });

  it("handles multiple claims in order", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("1", "c-1");
    await repo.insertWarm("2", "c-2");
    await repo.insertWarm("3", "c-3");

    const c1 = await repo.claimWarm("t-a", "bot-a");
    const c2 = await repo.claimWarm("t-b", "bot-b");
    const c3 = await repo.claimWarm("t-c", "bot-c");
    const c4 = await repo.claimWarm("t-d", "bot-d");

    expect(c1?.id).toBe("1");
    expect(c2?.id).toBe("2");
    expect(c3?.id).toBe("3");
    expect(c4).toBeNull();
    expect(await repo.warmCount()).toBe(0);
  });

  it("dead instances are not claimable", async () => {
    const repo = new InMemoryPoolRepository();
    await repo.insertWarm("a", "c-a");
    await repo.markDead("a");

    const result = await repo.claimWarm("t1", "bot");
    expect(result).toBeNull();
  });
});
