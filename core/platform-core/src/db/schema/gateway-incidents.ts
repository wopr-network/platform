import { bigint, index, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Gateway incident log — forensic record of every upstream failure.
 *
 * When the gateway returns an error to the client, a row is written here
 * with full upstream context (provider, model, raw body). The client only
 * sees the incident_id — never the internals.
 */
export const gatewayIncidents = pgTable(
  "gateway_incidents",
  {
    id: text("id").primaryKey(),
    timestamp: bigint("timestamp", { mode: "number" }).notNull(),
    tenantId: text("tenant_id").notNull(),
    capability: text("capability").notNull(),
    provider: text("provider").notNull(),
    model: text("model"),
    errorCode: text("error_code").notNull(),
    upstreamStatus: integer("upstream_status"),
    upstreamBody: text("upstream_body"),
    requestDurationMs: integer("request_duration_ms"),
    modelsAttempted: text("models_attempted"),
  },
  (table) => [
    index("idx_gi_timestamp").on(table.timestamp),
    index("idx_gi_tenant").on(table.tenantId),
    index("idx_gi_error_code").on(table.errorCode),
  ],
);
