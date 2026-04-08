/**
 * Node agent API routes — HTTP registration only, no WebSocket.
 *
 * REST endpoints:
 *   POST /internal/nodes/register        — returning node re-registration (secret auth)
 *   POST /internal/nodes/register-token   — first-time registration (one-time token)
 *
 * Auth:
 *   - Returning nodes authenticate via Authorization: Bearer <nodeSecret>
 *   - First-time nodes authenticate via one-time registration token in body
 *
 * After this HTTP handshake the agent has:
 *   - `nodeId` + `nodeSecret` (persisted to /etc/wopr/credentials.json)
 *   - `dbUrl` for the shared `wopr_agent` Postgres role
 *
 * It then connects to Postgres directly and runs its AgentWorker. No
 * WebSocket, no command bus, no long-lived core-side connection state.
 * The `attachNodeWebSocket` function that used to live here is gone along
 * with NodeCommandBus / NodeConnectionManager / the WS client on the
 * agent side.
 */

import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { logger } from "../../config/logger.js";
import type { INodeRepository } from "../../fleet/node-repository.js";

interface NodeAgentRouteDeps {
  nodeRepo: INodeRepository;
  /** Vault provider for reading Spaces credentials. Null in dev/test. */
  vault?: import("../../config/vault-provider.js").VaultConfigProvider | null;
  /**
   * Builder for the per-agent Postgres connection URL. When provided,
   * registration responses include `db_url` so the agent can start its
   * AgentWorker. Returns null when the queue worker is not enabled
   * (e.g., `secrets.agentDbPassword` is not set in Vault).
   *
   * The URL embeds the shared `wopr_agent` Postgres role + the password
   * from secrets.agentDbPassword. The agent sets `agent.node_id` GUC on
   * connection so the RLS policy constrains it to its own rows.
   */
  agentDbUrlBuilder?: ((nodeId: string) => string | null) | null;
}

/** Spaces credentials included in registration responses. */
interface SpacesConfig {
  access_key: string;
  secret_key: string;
  endpoint: string;
  bucket: string;
  region: string;
}

async function getSpacesConfig(vault: NodeAgentRouteDeps["vault"]): Promise<SpacesConfig | null> {
  if (!vault) return null;
  try {
    const data = await vault.read("shared/digitalocean");
    if (!data.spaces_access_key || !data.spaces_secret_key) return null;
    return {
      access_key: data.spaces_access_key,
      secret_key: data.spaces_secret_key,
      endpoint: data.spaces_endpoint ?? "nyc3.digitaloceanspaces.com",
      bucket: data.spaces_bucket ?? "wopr-backups",
      region: data.spaces_region ?? "nyc3",
    };
  } catch {
    return null;
  }
}

export function createNodeAgentRoutes(deps: NodeAgentRouteDeps): Hono {
  const app = new Hono();
  const { nodeRepo } = deps;
  const buildAgentDbUrl = deps.agentDbUrlBuilder ?? (() => null);

  /**
   * POST /register — returning node re-registration.
   * Auth: Authorization: Bearer <nodeSecret>
   */
  app.post("/register", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing Authorization: Bearer <nodeSecret>" }, 401);
    }
    const secret = authHeader.slice(7);

    // Verify secret against stored hash
    const node = await nodeRepo.getBySecret(secret);
    if (!node) {
      return c.json({ error: "Invalid node secret" }, 403);
    }

    const body = await c.req.json<{
      node_id: string;
      host: string;
      capacity_mb: number;
      agent_version: string;
    }>();

    // Node ID in body must match the authenticated node
    if (body.node_id !== node.id) {
      logger.warn("Node registration ID mismatch", { authenticated: node.id, claimed: body.node_id });
      return c.json({ error: "Node ID mismatch" }, 403);
    }

    await nodeRepo.register({
      nodeId: body.node_id,
      host: body.host,
      capacityMb: body.capacity_mb,
      agentVersion: body.agent_version,
    });
    logger.info("Node re-registered via secret", { nodeId: node.id });

    // Re-issue the dbUrl so a rotating credential reaches the agent.
    const dbUrl = buildAgentDbUrl(node.id);
    return c.json({ ok: true, node_id: node.id, ...(dbUrl ? { db_url: dbUrl } : {}) });
  });

  /**
   * POST /register-token — first-time registration with one-time token.
   * Returns node_id + node_secret for future auth.
   */
  app.post("/register-token", async (c) => {
    const body = await c.req.json<{
      registration_token: string;
      host: string;
      capacity_mb: number;
      agent_version: string;
    }>();

    // For provisioned nodes, the token IS the WOPR_NODE_SECRET from
    // cloud-init. Look it up by secret; if found, re-register with its
    // existing id.
    const matchedNode = await nodeRepo.getBySecret(body.registration_token);

    if (matchedNode) {
      // Cloud-init provisioned node — re-registering with its injected secret
      await nodeRepo.register({
        nodeId: matchedNode.id,
        host: body.host,
        capacityMb: body.capacity_mb,
        agentVersion: body.agent_version,
      });

      logger.info("Provisioned node registered via injected secret", { nodeId: matchedNode.id });

      const spaces = await getSpacesConfig(deps.vault);
      const dbUrl = buildAgentDbUrl(matchedNode.id);
      return c.json({
        node_id: matchedNode.id,
        node_secret: body.registration_token,
        ...(spaces ? { spaces } : {}),
        ...(dbUrl ? { db_url: dbUrl } : {}),
      });
    }

    // Self-hosted node — generate new node ID + secret
    const nodeId = `node-${randomBytes(8).toString("hex")}`;
    const nodeSecret = randomBytes(32).toString("base64url");
    const nodeSecretHash = createHash("sha256").update(nodeSecret).digest("hex");

    await nodeRepo.registerSelfHosted({
      nodeId,
      host: body.host,
      capacityMb: body.capacity_mb,
      agentVersion: body.agent_version,
      ownerUserId: "",
      label: null,
      nodeSecretHash,
    });

    logger.info("Self-hosted node registered via token", { nodeId });

    const spaces = await getSpacesConfig(deps.vault);
    const dbUrl = buildAgentDbUrl(nodeId);
    return c.json({
      node_id: nodeId,
      node_secret: nodeSecret,
      ...(spaces ? { spaces } : {}),
      ...(dbUrl ? { db_url: dbUrl } : {}),
    });
  });

  return app;
}
