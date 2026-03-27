/**
 * Idempotent seed: creates the holyship-platform internal billing tenant
 * with a stable service key for platform-to-gateway LLM billing.
 *
 * Safe to call on every boot — skips if the tenant already exists.
 */
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DrizzleDb } from "./index.js";
import { gatewayServiceKeys } from "./schema/gateway-service-keys.js";
import { tenants } from "./schema/tenants.js";

const PLATFORM_TENANT_ID = "holyship-platform";
const PLATFORM_TENANT_SLUG = "holyship-platform";
const PLATFORM_INSTANCE_ID = "holyship-platform-internal";

export interface PlatformServiceSeedResult {
  tenantId: string;
  serviceKey: string | null; // null if tenant + key already existed
}

export async function seedPlatformServiceTenant(db: DrizzleDb): Promise<PlatformServiceSeedResult> {
  // Check if tenant already exists
  const existing = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, PLATFORM_TENANT_ID)).limit(1);

  if (existing.length > 0) {
    return { tenantId: PLATFORM_TENANT_ID, serviceKey: null };
  }

  // Create the platform_service tenant
  await db.insert(tenants).values({
    id: PLATFORM_TENANT_ID,
    name: "Holy Ship Platform",
    slug: PLATFORM_TENANT_SLUG,
    type: "platform_service",
    ownerId: "system",
    billingEmail: null,
    createdAt: Date.now(),
  });

  // Generate a service key and store its hash
  const rawKey = `sk-hs-${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  await db.insert(gatewayServiceKeys).values({
    id: crypto.randomUUID(),
    keyHash,
    tenantId: PLATFORM_TENANT_ID,
    instanceId: PLATFORM_INSTANCE_ID,
    createdAt: Date.now(),
    revokedAt: null,
  });

  return { tenantId: PLATFORM_TENANT_ID, serviceKey: rawKey };
}
