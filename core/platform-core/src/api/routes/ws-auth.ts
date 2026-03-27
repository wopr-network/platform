export interface WsAuthRequest {
  nodeId: string;
  authHeader: string | undefined;
}

export interface WsAuthResult {
  authenticated: boolean;
  nodeId?: string;
  reason?: string;
}

export interface NodeSecretVerifier {
  verifyNodeSecret(nodeId: string, secret: string): Promise<boolean | null>;
}

/**
 * Authenticate a WebSocket upgrade request for a node agent connection.
 *
 * The bearer token resolves to a specific node via per-node persistent secret;
 * the resolved nodeId must match the URL nodeId.
 *
 * @param verifier - object with verifyNodeSecret method (typically a node repository)
 */
export async function authenticateWebSocketUpgrade(
  req: WsAuthRequest,
  verifier: NodeSecretVerifier,
): Promise<WsAuthResult> {
  const { nodeId, authHeader } = req;
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");

  // Per-node persistent secret — timing-safe comparison via verifyNodeSecret
  if (bearer) {
    const verified = await verifier.verifyNodeSecret(nodeId, bearer);
    if (verified === true) {
      return { authenticated: true, nodeId };
    }
  }

  // No valid auth
  if (!bearer) {
    return { authenticated: false, reason: "unauthorized" };
  }
  return { authenticated: false, reason: "unauthorized" };
}
