import { Hono } from "hono";
import type { AuthEnv } from "../../auth/index.js";
import { validateTenantOwnership } from "../../auth/index.js";
import { decrypt as defaultDecrypt, deriveInstanceKey as defaultDeriveInstanceKey } from "../../security/encryption.js";
import {
  forwardSecretsToInstance as defaultForwardSecrets,
  writeEncryptedSeed as defaultWriteSeed,
} from "../../security/key-injection.js";
import { validateProviderKey as defaultValidateKey } from "../../security/key-validation.js";
import { validateKeyRequestSchema, writeSecretsRequestSchema } from "../../security/types.js";

/** Allowlist: only alphanumeric, hyphens, and underscores. */
const INSTANCE_ID_RE = /^[a-zA-Z0-9_-]+$/;

function isValidInstanceId(id: string): boolean {
  return INSTANCE_ID_RE.test(id);
}

export interface IProfileLookup {
  getInstanceTenantId(instanceId: string): Promise<string | undefined>;
}

export interface SecretsSecurityFns {
  decrypt: typeof defaultDecrypt;
  deriveInstanceKey: typeof defaultDeriveInstanceKey;
  writeEncryptedSeed: typeof defaultWriteSeed;
  forwardSecretsToInstance: typeof defaultForwardSecrets;
  validateProviderKey: typeof defaultValidateKey;
}

export interface SecretsDeps {
  profileLookup: IProfileLookup;
  platformSecret?: string;
  instanceDataDir?: string;
  logger?: { error(msg: string, meta?: Record<string, unknown>): void };
  /** Override security functions (useful for testing). Falls back to platform-core defaults. */
  security?: Partial<SecretsSecurityFns>;
}

/**
 * Create secrets management routes.
 *
 * @param deps - Dependencies for secret operations
 */
export function createSecretsRoutes(deps: SecretsDeps): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  const instanceDataDir = deps.instanceDataDir ?? "/data/instances";

  // Resolve security functions with defaults
  const decryptFn = deps.security?.decrypt ?? defaultDecrypt;
  const deriveInstanceKeyFn = deps.security?.deriveInstanceKey ?? defaultDeriveInstanceKey;
  const writeEncryptedSeedFn = deps.security?.writeEncryptedSeed ?? defaultWriteSeed;
  const forwardSecretsFn = deps.security?.forwardSecretsToInstance ?? defaultForwardSecrets;
  const validateKeyFn = deps.security?.validateProviderKey ?? defaultValidateKey;

  /**
   * PUT /instances/:id/config/secrets
   *
   * Writes secrets to a running instance by forwarding the body opaquely,
   * or writes an encrypted seed file if the instance is not running.
   */
  routes.put("/instances/:id/config/secrets", async (c) => {
    const instanceId = c.req.param("id");
    if (!isValidInstanceId(instanceId)) {
      return c.json({ error: "Invalid instance ID" }, 400);
    }

    // Validate tenant ownership of the instance
    const tenantId = await deps.profileLookup.getInstanceTenantId(instanceId);
    const ownershipError = validateTenantOwnership(c, instanceId, tenantId);
    if (ownershipError) {
      return ownershipError;
    }

    const mode = c.req.query("mode") || "proxy";

    if (mode === "seed") {
      // Pre-boot: parse body to encrypt, then discard plaintext
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }

      const parsed = writeSecretsRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
      }

      if (!deps.platformSecret) {
        return c.json({ error: "Platform secret not configured" }, 500);
      }

      try {
        const instanceKey = deriveInstanceKeyFn(instanceId, deps.platformSecret);
        const woprHome = `${instanceDataDir}/${instanceId}`;
        await writeEncryptedSeedFn(woprHome, parsed.data, instanceKey);
        return c.json({ ok: true, mode: "seed" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to write seed";
        deps.logger?.error("Failed to write encrypted seed", { instanceId, error: message });
        return c.json({ error: "Failed to write encrypted seed" }, 500);
      }
    }

    // Default: proxy mode — forward body opaquely to the instance container
    const rawBody = await c.req.text();
    const instanceUrl = `http://wopr-${instanceId}:3000`;
    const authHeader = c.req.header("Authorization") || "";
    const sessionToken = authHeader.replace(/^Bearer\s+/i, "");

    const result = await forwardSecretsFn(instanceUrl, sessionToken, rawBody);
    if (result.ok) {
      return c.json({ ok: true, mode: "proxy" });
    }
    const status = result.status === 502 ? 502 : result.status === 503 ? 503 : result.status === 404 ? 404 : 500;
    return c.json({ error: result.error || "Proxy failed" }, status);
  });

  /**
   * POST /validate-key
   *
   * Validates a provider API key without logging or persisting it.
   */
  routes.post("/validate-key", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = validateKeyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    const { provider, encryptedKey } = parsed.data;

    // Decrypt the key in memory
    let plaintextKey: string;
    try {
      const encryptedPayload = JSON.parse(encryptedKey);
      const instanceId = c.req.query("instanceId");
      if (!instanceId) {
        return c.json({ error: "instanceId query parameter required" }, 400);
      }
      if (!isValidInstanceId(instanceId)) {
        return c.json({ error: "Invalid instance ID" }, 400);
      }

      // Validate tenant ownership of the instance
      const tenantId = await deps.profileLookup.getInstanceTenantId(instanceId);
      const ownershipError = validateTenantOwnership(c, instanceId, tenantId);
      if (ownershipError) {
        return ownershipError;
      }
      if (!deps.platformSecret) {
        return c.json({ error: "Platform secret not configured" }, 500);
      }
      const instanceKey = deriveInstanceKeyFn(instanceId, deps.platformSecret);
      plaintextKey = decryptFn(encryptedPayload, instanceKey);
    } catch {
      return c.json({ error: "Failed to decrypt key payload" }, 400);
    }

    // Validate against the provider API
    const result = await validateKeyFn(provider, plaintextKey);

    // Explicitly discard the key reference
    plaintextKey = "";

    return c.json({ valid: result.valid, error: result.error });
  });

  return routes;
}
