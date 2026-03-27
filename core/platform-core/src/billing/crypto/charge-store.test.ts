import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PlatformDb } from "../../db/index.js";
import { beginTestTransaction, createTestDb, endTestTransaction, rollbackTestTransaction } from "../../test/db.js";
import { CryptoChargeRepository } from "./charge-store.js";

describe("CryptoChargeRepository", () => {
  let pool: PGlite;
  let db: PlatformDb;
  let store: CryptoChargeRepository;

  beforeAll(async () => {
    ({ db, pool } = await createTestDb());
    await beginTestTransaction(pool);
  });

  afterAll(async () => {
    await endTestTransaction(pool);
    await pool.close();
  });

  beforeEach(async () => {
    await rollbackTestTransaction(pool);
    store = new CryptoChargeRepository(db);
  });

  it("create() stores a charge with New status", async () => {
    await store.create("inv-001", "tenant-1", 2500);

    const charge = await store.getByReferenceId("inv-001");
    expect(charge).not.toBeNull();
    expect(charge?.referenceId).toBe("inv-001");
    expect(charge?.tenantId).toBe("tenant-1");
    expect(charge?.amountUsdCents).toBe(2500);
    expect(charge?.status).toBe("New");
    expect(charge?.creditedAt).toBeNull();
    expect(charge?.confirmations).toBe(0);
    expect(charge?.confirmationsRequired).toBe(1);
    expect(charge?.txHash).toBeNull();
    expect(charge?.amountReceivedCents).toBe(0);
  });

  it("getByReferenceId() returns null when not found", async () => {
    const charge = await store.getByReferenceId("inv-nonexistent");
    expect(charge).toBeNull();
  });

  it("updateStatus() updates status, currency and filled_amount (deprecated compat)", async () => {
    await store.create("inv-002", "tenant-2", 5000);
    await store.updateStatus("inv-002", "Settled", "BTC", "0.00025");

    const charge = await store.getByReferenceId("inv-002");
    expect(charge?.status).toBe("Settled");
    expect(charge?.currency).toBe("BTC");
    expect(charge?.filledAmount).toBe("0.00025");
  });

  it("updateStatus() handles partial updates (no currency)", async () => {
    await store.create("inv-003", "tenant-3", 1000);
    await store.updateStatus("inv-003", "Processing");

    const charge = await store.getByReferenceId("inv-003");
    expect(charge?.status).toBe("Processing");
    expect(charge?.currency).toBeNull();
  });

  it("isCredited() returns false before markCredited", async () => {
    await store.create("inv-004", "tenant-4", 1500);
    expect(await store.isCredited("inv-004")).toBe(false);
  });

  it("markCredited() sets creditedAt", async () => {
    await store.create("inv-005", "tenant-5", 3000);
    await store.markCredited("inv-005");

    const charge = await store.getByReferenceId("inv-005");
    expect(charge?.creditedAt).not.toBeNull();
  });

  it("isCredited() returns true after markCredited", async () => {
    await store.create("inv-006", "tenant-6", 2000);
    await store.markCredited("inv-006");
    expect(await store.isCredited("inv-006")).toBe(true);
  });

  describe("updateProgress", () => {
    it("updates partial payment progress", async () => {
      await store.createStablecoinCharge({
        referenceId: "prog-001",
        tenantId: "t-1",
        amountUsdCents: 5000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xprog001",
        derivationIndex: 0,
      });

      await store.updateProgress("prog-001", {
        status: "partial",
        amountReceivedCents: 2500,
        confirmations: 2,
        confirmationsRequired: 6,
        txHash: "0xabc123",
      });

      const record = await store.getByReferenceId("prog-001");
      expect(record?.status).toBe("Processing");
      expect(record?.amountReceivedCents).toBe(2500);
      expect(record?.confirmations).toBe(2);
      expect(record?.confirmationsRequired).toBe(6);
      expect(record?.txHash).toBe("0xabc123");
    });

    it("increments confirmations over multiple updates", async () => {
      await store.createStablecoinCharge({
        referenceId: "prog-002",
        tenantId: "t-2",
        amountUsdCents: 1000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xprog002",
        derivationIndex: 1,
      });

      await store.updateProgress("prog-002", {
        status: "partial",
        amountReceivedCents: 1000,
        confirmations: 1,
        confirmationsRequired: 6,
        txHash: "0xdef456",
      });

      await store.updateProgress("prog-002", {
        status: "partial",
        amountReceivedCents: 1000,
        confirmations: 3,
        confirmationsRequired: 6,
        txHash: "0xdef456",
      });

      const record = await store.getByReferenceId("prog-002");
      expect(record?.confirmations).toBe(3);
    });

    it("maps confirmed status to Settled in DB", async () => {
      await store.createStablecoinCharge({
        referenceId: "prog-003",
        tenantId: "t-3",
        amountUsdCents: 2000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xprog003",
        derivationIndex: 2,
      });

      await store.updateProgress("prog-003", {
        status: "confirmed",
        amountReceivedCents: 2000,
        confirmations: 6,
        confirmationsRequired: 6,
        txHash: "0xfinal",
      });

      const record = await store.getByReferenceId("prog-003");
      expect(record?.status).toBe("Settled");
    });
  });

  describe("get (UI-facing CryptoCharge)", () => {
    it("returns null when not found", async () => {
      const charge = await store.get("nonexistent");
      expect(charge).toBeNull();
    });

    it("returns full CryptoCharge with all fields for a new charge", async () => {
      await store.createStablecoinCharge({
        referenceId: "get-001",
        tenantId: "t-get",
        amountUsdCents: 5000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xget001",
        derivationIndex: 10,
      });

      const charge = await store.get("get-001");
      expect(charge).not.toBeNull();
      expect(charge?.id).toBe("get-001");
      expect(charge?.tenantId).toBe("t-get");
      expect(charge?.chain).toBe("base");
      expect(charge?.status).toBe("pending");
      expect(charge?.amountExpectedCents).toBe(5000);
      expect(charge?.amountReceivedCents).toBe(0);
      expect(charge?.confirmations).toBe(0);
      expect(charge?.confirmationsRequired).toBe(1);
      expect(charge?.txHash).toBeUndefined();
      expect(charge?.credited).toBe(false);
      expect(charge?.createdAt).toBeInstanceOf(Date);
    });

    it("reflects partial payment progress", async () => {
      await store.createStablecoinCharge({
        referenceId: "get-002",
        tenantId: "t-get2",
        amountUsdCents: 5000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xget002",
        derivationIndex: 11,
      });

      await store.updateProgress("get-002", {
        status: "partial",
        amountReceivedCents: 2500,
        confirmations: 3,
        confirmationsRequired: 6,
        txHash: "0xpartial",
      });

      const charge = await store.get("get-002");
      expect(charge?.status).toBe("partial");
      expect(charge?.amountReceivedCents).toBe(2500);
      expect(charge?.confirmations).toBe(3);
      expect(charge?.confirmationsRequired).toBe(6);
      expect(charge?.txHash).toBe("0xpartial");
      expect(charge?.credited).toBe(false);
    });

    it("shows confirmed+credited status after markCredited", async () => {
      await store.createStablecoinCharge({
        referenceId: "get-003",
        tenantId: "t-get3",
        amountUsdCents: 1000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xget003",
        derivationIndex: 12,
      });

      await store.updateProgress("get-003", {
        status: "confirmed",
        amountReceivedCents: 1000,
        confirmations: 6,
        confirmationsRequired: 6,
        txHash: "0xfull",
      });
      await store.markCredited("get-003");

      const charge = await store.get("get-003");
      expect(charge?.status).toBe("confirmed");
      expect(charge?.credited).toBe(true);
      expect(charge?.amountReceivedCents).toBe(1000);
    });

    it("maps expired status correctly", async () => {
      await store.createStablecoinCharge({
        referenceId: "get-004",
        tenantId: "t-get4",
        amountUsdCents: 3000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xget004",
        derivationIndex: 13,
      });

      await store.updateProgress("get-004", {
        status: "expired",
        amountReceivedCents: 0,
        confirmations: 0,
        confirmationsRequired: 6,
      });

      const charge = await store.get("get-004");
      expect(charge?.status).toBe("expired");
    });

    it("returns chain as 'unknown' for legacy charges without chain", async () => {
      await store.create("get-005", "t-get5", 500);

      const charge = await store.get("get-005");
      expect(charge?.chain).toBe("unknown");
    });
  });

  describe("stablecoin charges", () => {
    it("creates a stablecoin charge with chain/token/address", async () => {
      await store.createStablecoinCharge({
        referenceId: "sc:base:usdc:0x123",
        tenantId: "tenant-1",
        amountUsdCents: 1000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xabc123",
        derivationIndex: 42,
      });
      const charge = await store.getByReferenceId("sc:base:usdc:0x123");
      expect(charge).not.toBeNull();
      expect(charge?.chain).toBe("base");
      expect(charge?.token).toBe("USDC");
      expect(charge?.depositAddress).toBe("0xabc123");
      expect(charge?.derivationIndex).toBe(42);
      expect(charge?.amountUsdCents).toBe(1000);
    });

    it("looks up charge by deposit address", async () => {
      await store.createStablecoinCharge({
        referenceId: "sc:base:usdc:0x456",
        tenantId: "tenant-2",
        amountUsdCents: 5000,
        chain: "base",
        token: "USDC",
        depositAddress: "0xdef456",
        derivationIndex: 43,
      });
      const charge = await store.getByDepositAddress("0xdef456");
      expect(charge).not.toBeNull();
      expect(charge?.tenantId).toBe("tenant-2");
      expect(charge?.amountUsdCents).toBe(5000);
    });

    it("returns null for unknown deposit address", async () => {
      const charge = await store.getByDepositAddress("0xnonexistent");
      expect(charge).toBeNull();
    });

    it("gets next derivation index (0 when empty)", async () => {
      const idx = await store.getNextDerivationIndex();
      expect(idx).toBe(0);
    });

    it("gets next derivation index (max + 1)", async () => {
      await store.createStablecoinCharge({
        referenceId: "sc:idx-test",
        tenantId: "t",
        amountUsdCents: 100,
        chain: "base",
        token: "USDC",
        depositAddress: "0xidxtest",
        derivationIndex: 5,
      });
      const idx = await store.getNextDerivationIndex();
      expect(idx).toBe(6);
    });
  });
});
