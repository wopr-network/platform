import { z } from "zod";

/** Agent version string, read from package.json at build time */
export const AGENT_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const nodeAgentConfigSchema = z
  .object({
    /** Platform API base URL (HTTPS required for public endpoints; HTTP allowed for localhost and internal Docker DNS) */
    platformUrl: z
      .string()
      .url()
      .refine((url) => {
        const parsed = new URL(url);
        const isLocal =
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname.endsWith(".internal") ||
          !parsed.hostname.includes("."); // Docker DNS names like "core-server-core-1"
        return parsed.protocol === "https:" || isLocal;
      }, "platformUrl must use HTTPS (http:// only allowed for localhost and internal Docker hostnames)"),
    /** Unique node identifier — assigned by platform during token registration */
    nodeId: z.string().min(1).optional(),
    /** Persistent per-node secret for authentication (assigned after first registration) */
    nodeSecret: z.string().optional(),
    /** One-time registration token for first-time setup */
    registrationToken: z.string().optional(),
    /** Heartbeat interval in milliseconds (kept for config compat, currently unused) */
    heartbeatIntervalMs: z.coerce.number().int().min(1000).default(30_000),
    /** Backup directory path */
    backupDir: z.string().default("/backups"),
    /** S3 bucket for backups */
    s3Bucket: z.string().default("wopr-backups"),
    /** Path to persist credentials after token registration */
    credentialsPath: z.string().default("/etc/wopr/credentials.json"),
    /** Per-node secret injected at provisioning time (WOPR_NODE_SECRET env var) */
    woprNodeSecret: z.string().optional(),
    /**
     * Postgres connection string for the DB-as-channel queue worker.
     * REQUIRED at boot — there is no WS bus fallback. Either the registration
     * response includes `db_url` (core has `agent_db_password` in Vault) or
     * the operator supplies it via the `AGENT_DB_URL` env var.
     */
    dbUrl: z.string().optional(),
  })
  .refine((c) => c.nodeSecret || c.registrationToken, "Either nodeSecret or registrationToken is required");

export type NodeAgentConfig = z.infer<typeof nodeAgentConfigSchema>;

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export interface NodeRegistration {
  node_id: string;
  host: string;
  capacity_mb: number;
  agent_version: string;
}
