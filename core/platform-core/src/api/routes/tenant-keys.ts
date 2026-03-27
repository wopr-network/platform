import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { encrypt } from "../../security/encryption.js";
import type { ITenantKeyRepository } from "../../security/tenant-keys/tenant-key-repository.js";
import { providerSchema } from "../../security/types.js";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const storeKeySchema = z.object({
  provider: providerSchema,
  apiKey: z.string().min(1, "API key is required"),
  label: z.string().max(100).optional(),
});

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface TenantKeyDeps {
  repo: () => ITenantKeyRepository;
  /** Platform secret for key derivation. If not provided, encrypt operations will fail with 500. */
  platformSecret?: string;
  logger?: { warn(msg: string): void };
}

/** Derive a per-tenant encryption key from tenant ID and platform secret. */
function deriveTenantKey(tenantId: string, platformSecret: string): Buffer {
  return createHmac("sha256", platformSecret).update(`tenant:${tenantId}`).digest();
}

/**
 * Create tenant key management routes.
 *
 * @param deps - Dependencies for tenant key operations
 */
export function createTenantKeyRoutes(deps: TenantKeyDeps): Hono {
  const routes = new Hono();

  /**
   * GET /
   *
   * List all API keys for the authenticated tenant.
   * Returns metadata only (never the encrypted key material).
   */
  routes.get("/", async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) {
      return c.json({ error: "Tenant context required" }, 400);
    }

    const keys = await deps.repo().listForTenant(tenantId);
    return c.json({ keys });
  });

  /**
   * GET /:provider
   *
   * Check whether the tenant has a stored key for a specific provider.
   * Returns metadata only.
   */
  routes.get("/:provider", async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) {
      return c.json({ error: "Tenant context required" }, 400);
    }

    const provider = c.req.param("provider");
    const parsed = providerSchema.safeParse(provider);
    if (!parsed.success) {
      return c.json({ error: "Invalid provider" }, 400);
    }

    const record = await deps.repo().get(tenantId, parsed.data);
    if (!record) {
      return c.json({ error: "No key stored for this provider" }, 404);
    }

    // Return metadata only, never the encrypted key
    return c.json({
      id: record.id,
      tenant_id: record.tenant_id,
      provider: record.provider,
      label: record.label,
      created_at: record.created_at,
      updated_at: record.updated_at,
    });
  });

  /**
   * PUT /:provider
   *
   * Store or replace a tenant's API key for a provider.
   * The key is encrypted at rest using AES-256-GCM with a tenant-derived key.
   */
  routes.put("/:provider", async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) {
      return c.json({ error: "Tenant context required" }, 400);
    }

    const provider = c.req.param("provider");
    const providerParsed = providerSchema.safeParse(provider);
    if (!providerParsed.success) {
      return c.json({ error: "Invalid provider" }, 400);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = storeKeySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    if (parsed.data.provider !== providerParsed.data) {
      return c.json({ error: "Provider in body must match URL parameter" }, 400);
    }

    if (!deps.platformSecret) {
      return c.json({ error: "Platform secret not configured" }, 500);
    }

    // Encrypt the key in memory, then discard the plaintext
    const tenantKey = deriveTenantKey(tenantId, deps.platformSecret);
    const encryptedPayload = encrypt(parsed.data.apiKey, tenantKey);

    const id = await deps.repo().upsert(tenantId, providerParsed.data, encryptedPayload, parsed.data.label ?? "");

    return c.json({ ok: true, id, provider: providerParsed.data });
  });

  /**
   * DELETE /:provider
   *
   * Delete a tenant's stored API key for a provider.
   */
  routes.delete("/:provider", async (c) => {
    const tenantId = getTenantId(c);
    if (!tenantId) {
      return c.json({ error: "Tenant context required" }, 400);
    }

    const provider = c.req.param("provider");
    const parsed = providerSchema.safeParse(provider);
    if (!parsed.success) {
      return c.json({ error: "Invalid provider" }, 400);
    }

    const deleted = await deps.repo().delete(tenantId, parsed.data);
    if (!deleted) {
      return c.json({ error: "No key stored for this provider" }, 404);
    }

    return c.json({ ok: true, provider: parsed.data });
  });

  return routes;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the tenant ID from the auth context. */
function getTenantId(c: { get: (key: string) => unknown }): string | undefined {
  try {
    return c.get("tokenTenantId") as string | undefined;
  } catch {
    return undefined;
  }
}
