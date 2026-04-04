/**
 * Gateway incident repository — forensic logging of upstream failures.
 *
 * Every gateway error writes a row with full upstream context. The client
 * only sees the incident_id. Support staff query the table for root cause.
 */

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { PlatformDb } from "../db/index.js";
import { gatewayIncidents } from "../db/schema/gateway-incidents.js";

export interface IncidentRecord {
  id: string;
  timestamp: number;
  tenantId: string;
  capability: string;
  provider: string;
  model?: string;
  errorCode: string;
  upstreamStatus?: number;
  /** Truncated to 4KB max. */
  upstreamBody?: string;
  requestDurationMs?: number;
  modelsAttempted?: string[];
}

export interface IIncidentRepo {
  record(incident: Omit<IncidentRecord, "id" | "timestamp">): Promise<string>;
  get(id: string): Promise<IncidentRecord | null>;
}

/** Generate a short, URL-safe incident ID. */
function incidentId(): string {
  return `inc_${crypto.randomBytes(12).toString("base64url")}`;
}

/** Truncate upstream body to prevent DB bloat. */
function truncateBody(body?: string): string | undefined {
  if (!body) return undefined;
  return body.length > 4096 ? `${body.slice(0, 4096)}... [truncated]` : body;
}

export class DrizzleIncidentRepo implements IIncidentRepo {
  constructor(private readonly db: PlatformDb) {}

  async record(input: Omit<IncidentRecord, "id" | "timestamp">): Promise<string> {
    const id = incidentId();
    const now = Date.now();
    await this.db.insert(gatewayIncidents).values({
      id,
      timestamp: now,
      tenantId: input.tenantId,
      capability: input.capability,
      provider: input.provider,
      model: input.model ?? null,
      errorCode: input.errorCode,
      upstreamStatus: input.upstreamStatus ?? null,
      upstreamBody: truncateBody(input.upstreamBody),
      requestDurationMs: input.requestDurationMs ?? null,
      modelsAttempted: input.modelsAttempted ? JSON.stringify(input.modelsAttempted) : null,
    });
    return id;
  }

  async get(id: string): Promise<IncidentRecord | null> {
    const rows = await this.db.select().from(gatewayIncidents).where(eq(gatewayIncidents.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      timestamp: row.timestamp,
      tenantId: row.tenantId,
      capability: row.capability,
      provider: row.provider,
      model: row.model ?? undefined,
      errorCode: row.errorCode,
      upstreamStatus: row.upstreamStatus ?? undefined,
      upstreamBody: row.upstreamBody ?? undefined,
      requestDurationMs: row.requestDurationMs ?? undefined,
      modelsAttempted: row.modelsAttempted ? (JSON.parse(row.modelsAttempted) as string[]) : undefined,
    };
  }
}
