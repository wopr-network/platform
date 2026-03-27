/**
 * Adapter socket — the orchestrator between capability requests and provider adapters.
 *
 * The socket layer is the glue: it receives a capability request with a tenant ID,
 * selects the right adapter, calls it, emits a MeterEvent, and returns the result.
 * Adapters never touch metering or billing — that's the socket's job.
 *
 * When an ArbitrageRouter is configured, the socket delegates provider selection
 * to the router (GPU-first, cost-sorted, 5xx failover) while keeping ownership
 * of budget checks, metering, BYOK, and margin calculation.
 */

import { Credit } from "@wopr-network/platform-core/credits";
import type { MeterEmitter } from "@wopr-network/platform-core/metering";
import type { AdapterCapability, AdapterResult, ProviderAdapter } from "../adapters/types.js";
import { withMargin } from "../adapters/types.js";
import type { ArbitrageRouter } from "../arbitrage/router.js";
import type { IBudgetChecker, SpendLimits } from "../budget/budget-checker.js";

export interface SocketConfig {
  /** MeterEmitter instance for usage tracking */
  meter: MeterEmitter;
  /** IBudgetChecker instance for pre-call budget validation */
  budgetChecker?: IBudgetChecker;
  /** Default margin multiplier (default: 1.3) */
  defaultMargin?: number;
  /** ArbitrageRouter for cost-optimized routing (GPU-first, cheapest, 5xx failover) */
  router?: ArbitrageRouter;
}

export interface SocketRequest {
  /** Who is making the request */
  tenantId: string;
  /** What capability is needed */
  capability: AdapterCapability;
  /** The request payload (matches the capability's input type) */
  input: unknown;
  /** Optional: force a specific adapter by name (highest priority, bypasses router) */
  adapter?: string;
  /** Optional: model specifier for model-level routing (e.g., "gemini-2.5-pro") */
  model?: string;
  /** Optional: override margin for this request */
  margin?: number;
  /** Optional: session ID for grouping events */
  sessionId?: string;
  /** Whether the tenant is using their own API key (BYOK) */
  byok?: boolean;
  /** Optional: tenant's spend limits (for budget checking) */
  spendLimits?: SpendLimits;
  /** Pricing tier: "standard" (self-hosted, cheap) or "premium" (third-party brand-name) */
  pricingTier?: "standard" | "premium";
  /** @deprecated Use spendLimits instead. Kept for backwards compat during migration. */
  tier?: string;
}

/** Map from capability to the adapter method name that fulfills it */
const CAPABILITY_METHOD: Record<AdapterCapability, keyof ProviderAdapter> = {
  transcription: "transcribe",
  "image-generation": "generateImage",
  "text-generation": "generateText",
  tts: "synthesizeSpeech",
  embeddings: "embed",
};

export class AdapterSocket {
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly meter: MeterEmitter;
  private readonly budgetChecker?: IBudgetChecker;
  private readonly defaultMargin: number;
  private readonly router?: ArbitrageRouter;

  constructor(config: SocketConfig) {
    this.meter = config.meter;
    this.budgetChecker = config.budgetChecker;
    this.defaultMargin = config.defaultMargin ?? 1.3;
    this.router = config.router;
  }

  /** Register an adapter. Overwrites any existing adapter with the same name. */
  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.name, adapter);
    // Also register with router so it can call the adapter during failover
    if (this.router) {
      this.router.registerAdapter(adapter);
    }
  }

  /** Execute a capability request against the best adapter. */
  async execute<T>(request: SocketRequest): Promise<T> {
    // Pre-call budget check — fail-closed if enabled and budget exceeded
    const limits = request.spendLimits;
    if (this.budgetChecker && limits && !request.byok) {
      const budgetResult = await this.budgetChecker.check(request.tenantId, limits);
      if (!budgetResult.allowed) {
        const error = Object.assign(new Error(budgetResult.reason ?? "Budget exceeded"), {
          httpStatus: budgetResult.httpStatus ?? 429,
          budgetCheck: budgetResult,
        });
        throw error;
      }
    }

    // Determine execution path: explicit adapter > arbitrage router > legacy routing
    let adapterResult: AdapterResult<T>;
    let providerName: string;
    let providerSelfHosted: boolean;

    if (request.adapter) {
      // Explicit adapter override — highest priority, bypasses router
      const result = await this.executeWithAdapter<T>(request.adapter, request.capability, request.input);
      adapterResult = result.adapterResult;
      providerName = result.providerName;
      providerSelfHosted = result.selfHosted;
    } else if (this.router) {
      // Arbitrage router — cost-optimized routing with GPU-first and 5xx failover.
      // Margin tracking is handled by the meter event below, not the router's callback.
      // The router's onMarginRecord callback is intentionally unused here — it fires
      // only when sellPrice is passed to route(), which the socket never does.
      const routerResult = await this.router.route<T>({
        capability: request.capability,
        tenantId: request.tenantId,
        input: request.input,
        model: request.model,
      });
      adapterResult = routerResult;
      providerName = routerResult.provider;
      const routedAdapter = this.adapters.get(providerName);
      if (!routedAdapter) {
        throw new Error(
          `Router selected provider "${providerName}" but it is not registered in the socket. ` +
            `Always register adapters via socket.register() — never directly on the router.`,
        );
      }
      providerSelfHosted = routedAdapter.selfHosted === true;
    } else {
      // Legacy routing — first-match or tier-based
      const adapter = this.resolveAdapter(request);
      const result = await this.executeWithAdapter<T>(adapter.name, request.capability, request.input);
      adapterResult = result.adapterResult;
      providerName = result.providerName;
      providerSelfHosted = result.selfHosted;
    }

    // Compute charge if the adapter didn't supply one
    const margin = request.margin ?? this.defaultMargin;
    const charge = adapterResult.charge ?? withMargin(adapterResult.cost, margin);

    // Emit meter event — BYOK tenants get zero cost/charge (WOP-512)
    const isByok = request.byok === true;
    await this.meter.emit({
      tenant: request.tenantId,
      cost: isByok ? Credit.ZERO : adapterResult.cost,
      charge: isByok ? Credit.ZERO : charge,
      capability: request.capability,
      provider: providerName,
      timestamp: Date.now(),
      ...(request.sessionId ? { sessionId: request.sessionId } : {}),
      tier: isByok ? "byok" : providerSelfHosted ? "wopr" : "branded",
    });

    return adapterResult.result;
  }

  /** List all capabilities across all registered adapters (deduplicated). */
  capabilities(): AdapterCapability[] {
    const seen = new Set<AdapterCapability>();
    for (const adapter of this.adapters.values()) {
      for (const cap of adapter.capabilities) {
        seen.add(cap);
      }
    }
    return [...seen];
  }

  /** Call a specific adapter by name. Used by explicit override and legacy routing. */
  private async executeWithAdapter<T>(
    adapterName: string,
    capability: AdapterCapability,
    input: unknown,
  ): Promise<{ adapterResult: AdapterResult<T>; providerName: string; selfHosted: boolean }> {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter "${adapterName}" is not registered`);
    }
    if (!adapter.capabilities.includes(capability)) {
      throw new Error(`Adapter "${adapterName}" does not support capability "${capability}"`);
    }

    const method = CAPABILITY_METHOD[capability];
    const fn = adapter[method] as ((input: unknown) => Promise<AdapterResult<T>>) | undefined;
    if (!fn) {
      throw new Error(
        `Adapter "${adapter.name}" is registered for "${capability}" but does not implement "${String(method)}"`,
      );
    }

    const adapterResult = await fn.call(adapter, input);
    return { adapterResult, providerName: adapter.name, selfHosted: adapter.selfHosted === true };
  }

  /** Resolve which adapter to use for a request (legacy routing — pricingTier or first-match). */
  private resolveAdapter(request: SocketRequest): ProviderAdapter {
    // If a pricing tier is specified, prefer adapters matching that tier
    if (request.pricingTier) {
      const preferSelfHosted = request.pricingTier === "standard";

      // Find first adapter matching tier preference, fall back to any with capability
      for (const adapter of this.adapters.values()) {
        if (!adapter.capabilities.includes(request.capability)) continue;

        const isSelfHosted = adapter.selfHosted === true;
        if (preferSelfHosted === isSelfHosted) {
          return adapter;
        }
      }

      // Fall back to any adapter with the capability if preferred tier unavailable
      for (const adapter of this.adapters.values()) {
        if (adapter.capabilities.includes(request.capability)) {
          return adapter;
        }
      }
    }

    // Otherwise, find the first adapter that supports the capability
    for (const adapter of this.adapters.values()) {
      if (adapter.capabilities.includes(request.capability)) {
        return adapter;
      }
    }

    throw new Error(`No adapter registered for capability "${request.capability}"`);
  }
}
