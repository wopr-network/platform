import { eq } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { tenantUpdateConfigs } from "../db/schema/index.js";
import type { ITenantUpdateConfigRepository, TenantUpdateConfig } from "./tenant-update-config-repository.js";

/** Drizzle-backed implementation of ITenantUpdateConfigRepository. */
export class DrizzleTenantUpdateConfigRepository implements ITenantUpdateConfigRepository {
  constructor(private readonly db: DrizzleDb) {}

  async get(tenantId: string): Promise<TenantUpdateConfig | null> {
    const rows = await this.db.select().from(tenantUpdateConfigs).where(eq(tenantUpdateConfigs.tenantId, tenantId));
    return rows[0] ? toConfig(rows[0]) : null;
  }

  async upsert(tenantId: string, config: Omit<TenantUpdateConfig, "tenantId" | "updatedAt">): Promise<void> {
    const now = Date.now();
    await this.db
      .insert(tenantUpdateConfigs)
      .values({
        tenantId,
        mode: config.mode,
        preferredHourUtc: config.preferredHourUtc,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: tenantUpdateConfigs.tenantId,
        set: {
          mode: config.mode,
          preferredHourUtc: config.preferredHourUtc,
          updatedAt: now,
        },
      });
  }

  async listAutoEnabled(): Promise<TenantUpdateConfig[]> {
    const rows = await this.db.select().from(tenantUpdateConfigs).where(eq(tenantUpdateConfigs.mode, "auto"));
    return rows.map(toConfig);
  }
}

function toConfig(row: typeof tenantUpdateConfigs.$inferSelect): TenantUpdateConfig {
  return {
    tenantId: row.tenantId,
    mode: row.mode as "auto" | "manual",
    preferredHourUtc: row.preferredHourUtc,
    updatedAt: row.updatedAt,
  };
}
