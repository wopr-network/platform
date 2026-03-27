import { describe, expect, it } from "vitest";
import type { AppRouter } from "@/lib/trpc-types";

/**
 * Compile-time assertion: causes a TypeScript error if T is not `true`.
 * This makes type-level tests actually fail at type-check time (tsc --noEmit)
 * when a namespace or procedure is removed from the AppRouter stub.
 */
type Assert<T extends true> = T;

/**
 * Type-level tests for the AppRouter stub.
 *
 * These verify that the type contract declared in trpc-types.ts
 * includes all router namespaces the UI depends on. If a namespace
 * is removed from the stub, these tests fail at type-check time
 * (tsc --noEmit / npm run check), catching the breakage before runtime.
 */
describe("trpc-types AppRouter contract", () => {
  it("declares all expected router namespaces", () => {
    type Router = AppRouter["_def"]["record"];
    type _CheckPageContext = Assert<"pageContext" extends keyof Router ? true : false>;
    type _CheckAdmin = Assert<"admin" extends keyof Router ? true : false>;
    type _CheckBilling = Assert<"billing" extends keyof Router ? true : false>;
    type _CheckFleet = Assert<"fleet" extends keyof Router ? true : false>;
    type _CheckPromotions = Assert<"promotions" extends keyof Router ? true : false>;
    type _CheckRateOverrides = Assert<"rateOverrides" extends keyof Router ? true : false>;
    type _CheckSettings = Assert<"settings" extends keyof Router ? true : false>;
    type _CheckCapabilities = Assert<"capabilities" extends keyof Router ? true : false>;
    type _CheckAuthSocial = Assert<"authSocial" extends keyof Router ? true : false>;
    // Runtime assertion is intentionally trivial — the real gate is tsc --noEmit
    // which fails if any Assert<...> type above resolves to `false`.
    expect(true).toBe(true);
  });

  it("billing namespace has critical procedures", () => {
    type Billing = AppRouter["_def"]["record"]["billing"];
    type _CheckCurrentPlan = Assert<"currentPlan" extends keyof Billing ? true : false>;
    type _CheckCreditsBalance = Assert<"creditsBalance" extends keyof Billing ? true : false>;
    type _CheckCreditsCheckout = Assert<"creditsCheckout" extends keyof Billing ? true : false>;
    type _CheckApplyCoupon = Assert<"applyCoupon" extends keyof Billing ? true : false>;
    type _CheckPortalSession = Assert<"portalSession" extends keyof Billing ? true : false>;
    type _CheckAutoTopupSettings = Assert<"autoTopupSettings" extends keyof Billing ? true : false>;
    type _CheckAccountStatus = Assert<"accountStatus" extends keyof Billing ? true : false>;
    // Runtime assertion is intentionally trivial — the real gate is tsc --noEmit
    // which fails if any Assert<...> type above resolves to `false`.
    expect(true).toBe(true);
  });

  it("fleet namespace has instance management procedures", () => {
    type Fleet = AppRouter["_def"]["record"]["fleet"];
    type _CheckListInstances = Assert<"listInstances" extends keyof Fleet ? true : false>;
    type _CheckGetInstance = Assert<"getInstance" extends keyof Fleet ? true : false>;
    type _CheckCreateInstance = Assert<"createInstance" extends keyof Fleet ? true : false>;
    type _CheckControlInstance = Assert<"controlInstance" extends keyof Fleet ? true : false>;
    type _CheckGetInstanceHealth = Assert<"getInstanceHealth" extends keyof Fleet ? true : false>;
    type _CheckGetInstanceLogs = Assert<"getInstanceLogs" extends keyof Fleet ? true : false>;
    type _CheckGetInstanceMetrics = Assert<"getInstanceMetrics" extends keyof Fleet ? true : false>;
    type _CheckListTemplates = Assert<"listTemplates" extends keyof Fleet ? true : false>;
    // Runtime assertion is intentionally trivial — the real gate is tsc --noEmit
    // which fails if any Assert<...> type above resolves to `false`.
    expect(true).toBe(true);
  });

  it("promotions namespace has CRUD and coupon procedures", () => {
    type Promos = AppRouter["_def"]["record"]["promotions"];
    type _CheckList = Assert<"list" extends keyof Promos ? true : false>;
    type _CheckCreate = Assert<"create" extends keyof Promos ? true : false>;
    type _CheckUpdate = Assert<"update" extends keyof Promos ? true : false>;
    type _CheckActivate = Assert<"activate" extends keyof Promos ? true : false>;
    type _CheckPause = Assert<"pause" extends keyof Promos ? true : false>;
    type _CheckCancel = Assert<"cancel" extends keyof Promos ? true : false>;
    type _CheckGenerateCouponBatch = Assert<
      "generateCouponBatch" extends keyof Promos ? true : false
    >;
    // Runtime assertion is intentionally trivial — the real gate is tsc --noEmit
    // which fails if any Assert<...> type above resolves to `false`.
    expect(true).toBe(true);
  });

  it("capabilities namespace has key and settings procedures", () => {
    type Caps = AppRouter["_def"]["record"]["capabilities"];
    type _CheckStoreKey = Assert<"storeKey" extends keyof Caps ? true : false>;
    type _CheckTestKey = Assert<"testKey" extends keyof Caps ? true : false>;
    type _CheckListCapabilitySettings = Assert<
      "listCapabilitySettings" extends keyof Caps ? true : false
    >;
    type _CheckListCapabilityMeta = Assert<"listCapabilityMeta" extends keyof Caps ? true : false>;
    // Runtime assertion is intentionally trivial — the real gate is tsc --noEmit
    // which fails if any Assert<...> type above resolves to `false`.
    expect(true).toBe(true);
  });

  it("admin namespace has inference and billingHealth", () => {
    type Admin = AppRouter["_def"]["record"]["admin"];
    type _CheckInference = Assert<"inference" extends keyof Admin ? true : false>;
    type _CheckBillingHealth = Assert<"billingHealth" extends keyof Admin ? true : false>;
    // Runtime assertion is intentionally trivial — the real gate is tsc --noEmit
    // which fails if any Assert<...> type above resolves to `false`.
    expect(true).toBe(true);
  });
});
