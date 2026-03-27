/**
 * Tests for gateway credit gate — grace buffer and credits_exhausted behavior (WOP-821).
 */

import type { PGlite } from "@electric-sql/pglite";
import { Credit, DrizzleLedger } from "@wopr-network/platform-core/credits";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrizzleDb } from "../db/index.js";
import { createTestDb, truncateAllTables } from "../test/db.js";
import { type CreditGateDeps, creditBalanceCheck, debitCredits } from "./credit-gate.js";
import type { GatewayAuthEnv } from "./service-key-auth.js";
import type { GatewayTenant } from "./types.js";

vi.mock("../config/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Build a real Hono context for testing by extracting it from a handler
async function buildHonoContext(tenantId: string): Promise<import("hono").Context<GatewayAuthEnv>> {
  let capturedCtx!: import("hono").Context<GatewayAuthEnv>;
  const app = new Hono<GatewayAuthEnv>();
  app.get("/test", (c) => {
    c.set("gatewayTenant", {
      id: tenantId,
      spendLimits: { maxSpendPerHour: null, maxSpendPerMonth: null },
    } as GatewayTenant);
    capturedCtx = c;
    return c.json({});
  });
  await app.request("/test");
  return capturedCtx;
}

// TOP OF FILE - shared across ALL describes
let pool: PGlite;
let db: DrizzleDb;

beforeAll(async () => {
  ({ db, pool } = await createTestDb());
});

afterAll(async () => {
  await pool.close();
});

// ---------------------------------------------------------------------------
// creditBalanceCheck — grace buffer tests
// ---------------------------------------------------------------------------

describe("creditBalanceCheck grace buffer", () => {
  beforeEach(async () => {
    await truncateAllTables(pool);
    await new DrizzleLedger(db).seedSystemAccounts();
  });

  it("returns null when balance is above estimated cost (passes)", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(500), "purchase", { description: "setup" });
    const c = await buildHonoContext("t1");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing" };
    expect(await creditBalanceCheck(c, deps, 1)).toBeNull();
  });

  it("returns null when balance is zero but within default grace buffer (passes)", async () => {
    // Balance at exactly 0 — within the -50 grace buffer
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(10), "purchase", { description: "setup" });
    await ledger.debit("t1", Credit.fromCents(10), "adapter_usage", { description: "drain" });
    const c = await buildHonoContext("t1");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing" };
    expect(await creditBalanceCheck(c, deps, 0)).toBeNull();
  });

  it("returns null when balance is -49 (within 50-cent grace buffer)", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(1), "purchase", { description: "setup" });
    await ledger.debit("t1", Credit.fromCents(50), "adapter_usage", { description: "drain", allowNegative: true }); // balance = -49
    const c = await buildHonoContext("t1");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing" };
    expect(await creditBalanceCheck(c, deps, 0)).toBeNull();
  });

  it("returns credits_exhausted when balance is at -50 (at grace buffer limit)", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(1), "purchase", { description: "setup" });
    await ledger.debit("t1", Credit.fromCents(51), "adapter_usage", { description: "drain", allowNegative: true }); // balance = -50
    const c = await buildHonoContext("t1");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing" };
    const result = await creditBalanceCheck(c, deps, 0);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("credits_exhausted");
  });

  it("returns credits_exhausted when balance is at -51 (beyond grace buffer)", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(1), "purchase", { description: "setup" });
    await ledger.debit("t1", Credit.fromCents(52), "adapter_usage", { description: "drain", allowNegative: true }); // balance = -51
    const c = await buildHonoContext("t1");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing" };
    const result = await creditBalanceCheck(c, deps, 0);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("credits_exhausted");
  });

  it("returns credits_exhausted when custom graceBufferCents=0 and balance is 0", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(10), "purchase", { description: "setup" });
    await ledger.debit("t1", Credit.fromCents(10), "adapter_usage", { description: "drain" }); // balance = 0
    const c = await buildHonoContext("t1");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing", graceBufferCents: 0 };
    const result = await creditBalanceCheck(c, deps, 0);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("credits_exhausted");
  });

  it("returns insufficient_credits when balance positive but below estimated cost", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(5), "purchase", { description: "setup" });
    const c = await buildHonoContext("t1");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing" };
    const result = await creditBalanceCheck(c, deps, 10);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("insufficient_credits");
  });
});

// ---------------------------------------------------------------------------
// debitCredits — allowNegative and onBalanceExhausted tests
// ---------------------------------------------------------------------------

describe("debitCredits with allowNegative and onBalanceExhausted", () => {
  beforeEach(async () => {
    await truncateAllTables(pool);
    await new DrizzleLedger(db).seedSystemAccounts();
  });

  it("debit with cost that would exceed balance succeeds (allowNegative=true)", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(5), "purchase", { description: "setup" }); // balance = 5 cents

    // costUsd = $0.10 = 10 cents, margin = 1.0
    // This should push balance negative without throwing
    await expect(
      debitCredits({ creditLedger: ledger, topUpUrl: "/billing" }, "t1", 0.1, 1.0, "chat-completions", "openrouter"),
    ).resolves.not.toThrow();

    expect((await ledger.balance("t1")).isNegative()).toBe(true);
  });

  it("fires onBalanceExhausted when debit causes balance to cross zero", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(5), "purchase", { description: "setup" }); // balance = 5 cents

    const onBalanceExhausted = vi.fn();
    // costUsd = $0.10 = 10 cents with margin 1.0 → chargeCents = 10, pushes balance to -5
    await debitCredits(
      { creditLedger: ledger, topUpUrl: "/billing", onBalanceExhausted },
      "t1",
      0.1,
      1.0,
      "chat-completions",
      "openrouter",
    );

    expect(onBalanceExhausted).toHaveBeenCalledWith("t1", -5);
  });

  it("does NOT fire onBalanceExhausted when balance stays positive after debit", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(500), "purchase", { description: "setup" }); // balance = 500 cents

    const onBalanceExhausted = vi.fn();
    // costUsd = $0.01 = 1 cent → balance stays at 499
    await debitCredits(
      { creditLedger: ledger, topUpUrl: "/billing", onBalanceExhausted },
      "t1",
      0.01,
      1.0,
      "chat-completions",
      "openrouter",
    );

    expect(onBalanceExhausted).not.toHaveBeenCalled();
    expect((await ledger.balance("t1")).greaterThan(Credit.ZERO)).toBe(true);
  });

  it("onBalanceExhausted callback receives correct tenantId and negative balance", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(3), "purchase", { description: "setup" }); // balance = 3 cents

    const onBalanceExhausted = vi.fn();
    // costUsd = $0.05 = 5 cents with margin 1.0 → pushes balance to -2
    await debitCredits(
      { creditLedger: ledger, topUpUrl: "/billing", onBalanceExhausted },
      "t1",
      0.05,
      1.0,
      "chat-completions",
      "openrouter",
    );

    expect(onBalanceExhausted).toHaveBeenCalledOnce();
    expect(onBalanceExhausted).toHaveBeenCalledWith("t1", -2);
  });

  it("calls onSpendAlertCrossed after successful debit", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("t1", Credit.fromCents(500), "purchase", { description: "setup" });

    const onSpendAlertCrossed = vi.fn();
    await debitCredits(
      { creditLedger: ledger, topUpUrl: "/billing", onSpendAlertCrossed },
      "t1",
      0.05,
      1.0,
      "chat-completions",
      "openrouter",
    );
    expect(onSpendAlertCrossed).toHaveBeenCalledWith("t1");
  });

  it("does NOT fire onBalanceExhausted when balance was already negative before debit", async () => {
    const ledger = new DrizzleLedger(db);
    // Start with negative balance: credit 5, debit 10 → balance = -5
    await ledger.credit("t1", Credit.fromCents(5), "purchase", { description: "setup" });
    await ledger.debit("t1", Credit.fromCents(10), "adapter_usage", { description: "drain", allowNegative: true });

    const onBalanceExhausted = vi.fn();
    // Another debit of 1 cent — balance goes from -5 to -6, but was already negative
    await debitCredits(
      { creditLedger: ledger, topUpUrl: "/billing", onBalanceExhausted },
      "t1",
      0.01,
      1.0,
      "chat-completions",
      "openrouter",
    );

    expect(onBalanceExhausted).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// creditBalanceCheck — metered tenant bypass
// ---------------------------------------------------------------------------

async function buildHonoContextWithMode(
  tenantId: string,
  inferenceMode: string,
): Promise<import("hono").Context<GatewayAuthEnv>> {
  let capturedCtx!: import("hono").Context<GatewayAuthEnv>;
  const app = new Hono<GatewayAuthEnv>();
  app.get("/test", (c) => {
    c.set("gatewayTenant", {
      id: tenantId,
      spendLimits: { maxSpendPerHour: null, maxSpendPerMonth: null },
      inferenceMode,
    } as GatewayTenant);
    capturedCtx = c;
    return c.json({});
  });
  await app.request("/test");
  return capturedCtx;
}

describe("creditBalanceCheck metered tenant bypass", () => {
  beforeEach(async () => {
    await truncateAllTables(pool);
    await new DrizzleLedger(db).seedSystemAccounts();
  });

  it("skips balance check for metered tenants even with zero balance", async () => {
    const ledger = new DrizzleLedger(db);
    // No credits — would normally fail with credits_exhausted
    const c = await buildHonoContextWithMode("metered-t1", "metered");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing" };
    const error = await creditBalanceCheck(c, deps, 0);
    expect(error).toBeNull();
  });

  it("still debits metered tenants for P&L tracking", async () => {
    const ledger = new DrizzleLedger(db);
    await ledger.credit("metered-t1", Credit.fromCents(0), "purchase", { description: "setup" }).catch(() => {});
    const mockLedger = {
      debit: vi.fn().mockResolvedValue(undefined),
      balance: vi.fn(),
      credit: vi.fn(),
    } as unknown as import("@wopr-network/platform-core/credits").ILedger;
    const deps: CreditGateDeps = { creditLedger: mockLedger, topUpUrl: "/billing" };
    await debitCredits(deps, "metered-tenant", 0.05, 1.5, "chat-completions", "openrouter");
    expect(mockLedger.debit).toHaveBeenCalled();
  });

  it("non-metered (managed) tenant still gets balance checked", async () => {
    const ledger = new DrizzleLedger(db);
    // No credits seeded — should fail
    const c = await buildHonoContextWithMode("managed-t1", "managed");
    const deps: CreditGateDeps = { creditLedger: ledger, topUpUrl: "/billing" };
    const error = await creditBalanceCheck(c, deps, 0);
    // Balance is 0, within grace buffer — passes
    expect(error).toBeNull();
  });
});
