import { bigint, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

export const gatewayServiceKeys = pgTable(
  "gateway_service_keys",
  {
    id: text("id").primaryKey(),
    /** SHA-256 hex digest of the raw service key. Raw key is NEVER stored. */
    keyHash: text("key_hash").notNull(),
    /** Tenant this key bills against. */
    tenantId: text("tenant_id").notNull(),
    /** Instance ID this key was issued for (one key per instance). */
    instanceId: text("instance_id").notNull(),
    /** Unix epoch ms. */
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    /** Unix epoch ms. Null = not revoked. */
    revokedAt: bigint("revoked_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("idx_gateway_service_keys_hash").on(table.keyHash),
    index("idx_gateway_service_keys_tenant").on(table.tenantId),
    index("idx_gateway_service_keys_instance").on(table.instanceId),
  ],
);
