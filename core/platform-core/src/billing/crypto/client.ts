/**
 * Crypto Key Server client — for products to call the shared service.
 *
 * Replaces BTCPayClient. Products set CRYPTO_SERVICE_URL instead of
 * BTCPAY_API_KEY + BTCPAY_BASE_URL + BTCPAY_STORE_ID.
 */

export interface CryptoServiceConfig {
  /** Base URL of the crypto key server (e.g. http://10.120.0.5:3100) */
  baseUrl: string;
  /** Service key for auth (reuses gateway service key) */
  serviceKey?: string;
  /** Tenant ID header */
  tenantId?: string;
}

export interface DeriveAddressResult {
  address: string;
  index: number;
  chain: string;
  token: string;
}

export interface CreateChargeResult {
  chargeId: string;
  address: string;
  chain: string;
  token: string;
  amountUsd: number;
  derivationIndex: number;
  expiresAt: string;
  displayAmount?: string;
  priceMicros?: number;
}

export interface ChargeStatus {
  chargeId: string;
  status: string;
  address: string | null;
  chain: string | null;
  token: string | null;
  amountUsdCents: number;
  creditedAt: string | null;
}

export interface ChainInfo {
  id: string;
  token: string;
  chain: string;
  decimals: number;
  displayName: string;
  contractAddress: string | null;
  confirmations: number;
  iconUrl: string | null;
}

/**
 * Client for the shared crypto key server.
 * Products use this instead of running local watchers + holding xpubs.
 */
export class CryptoServiceClient {
  constructor(private readonly config: CryptoServiceConfig) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.serviceKey) h.Authorization = `Bearer ${this.config.serviceKey}`;
    if (this.config.tenantId) h["X-Tenant-Id"] = this.config.tenantId;
    return h;
  }

  /** Derive the next unused address for a chain. */
  async deriveAddress(chain: string): Promise<DeriveAddressResult> {
    const res = await fetch(`${this.config.baseUrl}/address`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ chain }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CryptoService deriveAddress failed (${res.status}): ${text}`);
    }
    return (await res.json()) as DeriveAddressResult;
  }

  /** Create a payment charge — derives address, sets expiry, starts watching. */
  async createCharge(opts: {
    chain: string;
    amountUsd: number;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<CreateChargeResult> {
    const res = await fetch(`${this.config.baseUrl}/charges`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CryptoService createCharge failed (${res.status}): ${text}`);
    }
    return (await res.json()) as CreateChargeResult;
  }

  /** Check charge status. */
  async getCharge(chargeId: string): Promise<ChargeStatus> {
    const res = await fetch(`${this.config.baseUrl}/charges/${encodeURIComponent(chargeId)}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CryptoService getCharge failed (${res.status}): ${text}`);
    }
    return (await res.json()) as ChargeStatus;
  }

  /** List all enabled payment methods (for checkout UI). */
  async listChains(): Promise<ChainInfo[]> {
    const res = await fetch(`${this.config.baseUrl}/chains`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`CryptoService listChains failed (${res.status}): ${text}`);
    }
    return (await res.json()) as ChainInfo[];
  }
}

/**
 * Load crypto service config from environment.
 * Returns null if CRYPTO_SERVICE_URL is not set.
 *
 * Also supports legacy BTCPay env vars for backwards compat during migration.
 */
export function loadCryptoConfig(): CryptoServiceConfig | null {
  const baseUrl = process.env.CRYPTO_SERVICE_URL;
  if (baseUrl) {
    return {
      baseUrl,
      serviceKey: process.env.CRYPTO_SERVICE_KEY,
      tenantId: process.env.TENANT_ID,
    };
  }
  return null;
}

// Legacy type alias for backwards compat
export type CryptoConfig = CryptoServiceConfig;
