/**
 * HTTP client for the provision-server protocol.
 *
 * This is the platform side — it calls containers that embed
 * @wopr-network/provision-server to provision, update, and tear down tenants.
 */

/** Provisioning request sent to the container. */
export interface ProvisionRequest {
  tenantId: string;
  tenantName: string;
  gatewayUrl: string;
  apiKey: string;
  budgetCents: number;
  adminUser: {
    id: string;
    email: string;
    name: string;
  };
  agents?: Array<{
    name: string;
    role: string;
    title?: string;
    reportsTo?: string;
    budgetMonthlyCents?: number;
  }>;
  extra?: Record<string, unknown>;
}

/** Response from a successful provision call. */
export interface ProvisionResponse {
  tenantEntityId: string;
  tenantSlug?: string;
  adminUserId: string;
  agents: Array<{ id: string; name: string; role: string }>;
  extra?: Record<string, unknown>;
}

/** Health check response from a container. */
export interface HealthResponse {
  ok: boolean;
  provisioning: boolean;
  managed: boolean;
}

/**
 * Provision a container.
 *
 * Call this after fleet spins up the Docker container and its health check passes.
 *
 * @param containerUrl - Base URL of the container (e.g. http://10.0.0.5:3100)
 * @param secret - Shared bearer token
 * @param payload - Provisioning data
 */
export async function provisionContainer(
  containerUrl: string,
  secret: string,
  payload: ProvisionRequest,
): Promise<ProvisionResponse> {
  const res = await fetch(`${containerUrl}/internal/provision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Provision failed (${res.status}): ${body}`);
  }

  return (await res.json()) as ProvisionResponse;
}

/**
 * Update the spending budget on a container.
 */
export async function updateBudget(
  containerUrl: string,
  secret: string,
  tenantEntityId: string,
  budgetCents: number,
  perAgentCents?: number,
): Promise<void> {
  const res = await fetch(`${containerUrl}/internal/provision/budget`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ tenantEntityId, budgetCents, perAgentCents }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Budget update failed (${res.status}): ${body}`);
  }
}

/**
 * Deprovision a container (teardown).
 */
export async function deprovisionContainer(
  containerUrl: string,
  secret: string,
  tenantEntityId: string,
): Promise<void> {
  const res = await fetch(`${containerUrl}/internal/provision`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ tenantEntityId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Deprovision failed (${res.status}): ${body}`);
  }
}

/**
 * Health check a container.
 * Returns true if the container is ready and provisioning is active.
 */
export async function checkHealth(containerUrl: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const res = await fetch(`${containerUrl}/internal/provision/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as HealthResponse;
    return data.ok && data.provisioning;
  } catch {
    return false;
  }
}
