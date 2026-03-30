import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture constructor args for each test
const constructorCalls: unknown[] = [];

vi.mock("pg", () => {
  class MockPool {
    constructor(opts: unknown) {
      constructorCalls.push(opts);
    }
    query = vi.fn();
    end = vi.fn();
  }
  return { Pool: MockPool };
});

describe("getPool config", () => {
  beforeEach(() => {
    constructorCalls.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses default pool config when no DB_POOL_* env vars are set", async () => {
    const { initPool, getPool } = await import("./services.js");
    initPool("postgresql://test:test@localhost:5432/test");
    const pool = getPool();
    expect(pool).toBeDefined();
    expect(constructorCalls[0]).toMatchObject({
      connectionString: "postgresql://test:test@localhost:5432/test",
    });
  });

  it("creates pool via initPool with explicit connection string", async () => {
    const { initPool, getPool } = await import("./services.js");
    initPool("postgresql://user:pass@host:5432/db");
    const pool = getPool();
    expect(pool).toBeDefined();
    expect(constructorCalls[0]).toMatchObject({
      connectionString: "postgresql://user:pass@host:5432/db",
    });
  });

  it("throws when getPool is called before initPool", async () => {
    const { getPool } = await import("./services.js");
    expect(() => getPool()).toThrow("Pool not initialized");
  });

  it("returns same pool on subsequent getPool calls", async () => {
    const { initPool, getPool } = await import("./services.js");
    initPool("postgresql://test:test@localhost:5432/test");
    const a = getPool();
    const b = getPool();
    expect(a).toBe(b);
    expect(constructorCalls).toHaveLength(1);
  });
});
