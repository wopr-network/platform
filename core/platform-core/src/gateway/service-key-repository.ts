/**
 * Gateway service key repository.
 *
 * Stores SHA-256 hashes of per-instance service keys used to authenticate
 * tenant containers against the metered inference gateway. Raw keys are
 * NEVER stored — only hashes.
 */

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { PlatformDb } from "../db/index.js";
import { gatewayServiceKeys } from "../db/schema/gateway-service-keys.js";
import type { GatewayTenant } from "./types.js";

/** Hash a raw key for storage/lookup. */
function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface IServiceKeyRepository {
  /** Generate a new service key for an instance. Returns the raw key (caller must store it). */
  generate(tenantId: string, instanceId: string): Promise<string>;

  /** Resolve a raw bearer token to a GatewayTenant. Returns null if not found or revoked. */
  resolve(rawKey: string): Promise<GatewayTenant | null>;

  /** Revoke the service key for a specific instance. */
  revokeByInstance(instanceId: string): Promise<void>;

  /** Revoke all service keys for a tenant (used when tenant is deleted). */
  revokeByTenant(tenantId: string): Promise<void>;
}

export class DrizzleServiceKeyRepository implements IServiceKeyRepository {
  constructor(private readonly db: PlatformDb) {}

  async generate(tenantId: string, instanceId: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    const hash = hashKey(raw);
    const id = randomBytes(16).toString("hex");

    await this.db.insert(gatewayServiceKeys).values({
      id,
      keyHash: hash,
      tenantId,
      instanceId,
      createdAt: Date.now(),
    });

    return raw;
  }

  async resolve(rawKey: string): Promise<GatewayTenant | null> {
    const hash = hashKey(rawKey);
    const rows = await this.db
      .select({
        tenantId: gatewayServiceKeys.tenantId,
        instanceId: gatewayServiceKeys.instanceId,
      })
      .from(gatewayServiceKeys)
      .where(and(eq(gatewayServiceKeys.keyHash, hash), isNull(gatewayServiceKeys.revokedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.tenantId,
      instanceId: row.instanceId,
      spendLimits: { maxSpendPerHour: null, maxSpendPerMonth: null },
    };
  }

  async revokeByInstance(instanceId: string): Promise<void> {
    await this.db
      .update(gatewayServiceKeys)
      .set({ revokedAt: Date.now() })
      .where(and(eq(gatewayServiceKeys.instanceId, instanceId), isNull(gatewayServiceKeys.revokedAt)));
  }

  async revokeByTenant(tenantId: string): Promise<void> {
    await this.db
      .update(gatewayServiceKeys)
      .set({ revokedAt: Date.now() })
      .where(and(eq(gatewayServiceKeys.tenantId, tenantId), isNull(gatewayServiceKeys.revokedAt)));
  }
}
