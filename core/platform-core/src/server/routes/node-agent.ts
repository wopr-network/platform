/**
 * Node agent API routes — registration, token exchange, and WebSocket upgrade.
 *
 * REST endpoints:
 *   POST /internal/nodes/register        — returning node re-registration (secret auth)
 *   POST /internal/nodes/register-token   — first-time registration (one-time token)
 *
 * WebSocket:
 *   GET /internal/nodes/:nodeId/ws       — upgraded by the WS server (not Hono)
 *
 * Auth:
 *   - Returning nodes authenticate via Authorization: Bearer <nodeSecret>
 *   - First-time nodes authenticate via one-time registration token in body
 *   - WebSocket connections authenticate via Bearer token in Upgrade headers
 */

import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { logger } from "../../config/logger.js";
import type { NodeConnectionManager } from "../../fleet/node-connection-manager.js";
import type { INodeRepository } from "../../fleet/node-repository.js";

interface NodeAgentRouteDeps {
  nodeConnectionManager: NodeConnectionManager;
  nodeRepo: INodeRepository;
}

export function createNodeAgentRoutes(deps: NodeAgentRouteDeps): Hono {
  const app = new Hono();
  const { nodeConnectionManager, nodeRepo } = deps;

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
    const node = await nodeConnectionManager.getNodeBySecret(secret);
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

    await nodeConnectionManager.registerNode(body);
    logger.info("Node re-registered via secret", { nodeId: node.id });

    return c.json({ ok: true, node_id: node.id });
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

    // Validate registration token against the node_registration_tokens table
    // For provisioned nodes, the token is the WOPR_NODE_SECRET from cloud-init
    const matchedNode = await nodeRepo.getBySecret(body.registration_token);

    if (matchedNode) {
      // Cloud-init provisioned node — re-registering with its injected secret
      await nodeConnectionManager.registerNode({
        node_id: matchedNode.id,
        host: body.host,
        capacity_mb: body.capacity_mb,
        agent_version: body.agent_version,
      });

      logger.info("Provisioned node registered via injected secret", { nodeId: matchedNode.id });

      return c.json({
        node_id: matchedNode.id,
        node_secret: body.registration_token, // echo back — agent persists this
      });
    }

    // Self-hosted node — generate new node ID + secret
    const nodeId = `node-${randomBytes(8).toString("hex")}`;
    const nodeSecret = randomBytes(32).toString("base64url");
    const nodeSecretHash = createHash("sha256").update(nodeSecret).digest("hex");

    await nodeConnectionManager.registerSelfHostedNode({
      node_id: nodeId,
      host: body.host,
      capacity_mb: body.capacity_mb,
      agent_version: body.agent_version,
      ownerUserId: "", // self-hosted without owner — admin assigns later
      label: null,
      nodeSecretHash,
    });

    logger.info("Self-hosted node registered via token", { nodeId });

    return c.json({
      node_id: nodeId,
      node_secret: nodeSecret,
    });
  });

  return app;
}

/**
 * Attach WebSocket upgrade handler to a Node HTTP server.
 * Called after serve() returns the raw server.
 *
 * Auth: The agent sends Authorization: Bearer <nodeSecret> in the
 * Upgrade request headers. We verify before completing the handshake.
 */
export async function attachNodeWebSocket(server: import("node:http").Server, deps: NodeAgentRouteDeps): Promise<void> {
  const { WebSocketServer } = await import("ws");
  const { nodeConnectionManager, nodeRepo } = deps;

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const url = req.url ?? "";

    // Only handle /internal/nodes/:nodeId/ws
    const match = url.match(/^\/internal\/nodes\/([^/]+)\/ws/);
    if (!match) return; // let other upgrade handlers (if any) handle it

    const nodeId = match[1];
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      logger.warn("WS upgrade rejected: no auth", { nodeId });
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const secret = authHeader.slice(7);
    const verified = await nodeRepo.verifyNodeSecret(nodeId, secret);
    if (!verified) {
      logger.warn("WS upgrade rejected: bad secret", { nodeId });
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      logger.info("WS upgrade complete", { nodeId });
      nodeConnectionManager.handleWebSocket(nodeId, ws as never);
    });
  });

  logger.info("Node agent WebSocket handler attached");
}
