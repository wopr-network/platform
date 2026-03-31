/**
 * VaultConfigProvider — fetches secrets from HashiCorp Vault at boot time.
 *
 * Authenticates via AppRole (role_id + secret_id), reads KV v2 secrets,
 * and returns them as a typed object. No secrets touch disk or process.env.
 *
 * Falls back to process.env ONLY when VAULT_ADDR is not set (local dev).
 */

interface VaultAuthResponse {
  auth: {
    client_token: string;
    lease_duration: number;
  };
}

interface VaultKvResponse {
  data: {
    data: Record<string, string>;
  };
}

export interface VaultConfig {
  addr: string;
  roleId: string;
  secretId: string;
}

export class VaultConfigProvider {
  private token: string | null = null;

  constructor(private config: VaultConfig) {}

  /** Authenticate with AppRole and get a client token. */
  private async login(): Promise<string> {
    const res = await fetch(`${this.config.addr}/v1/auth/approle/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_id: this.config.roleId,
        secret_id: this.config.secretId,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Vault login failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as VaultAuthResponse;
    this.token = data.auth.client_token;
    return this.token;
  }

  /** Read a KV v2 secret path. Returns the key-value data. */
  async read(path: string): Promise<Record<string, string>> {
    if (!this.token) await this.login();
    const res = await fetch(`${this.config.addr}/v1/secret/data/${path}`, {
      headers: { "X-Vault-Token": this.token as string },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Vault read ${path} failed (${res.status}): ${body}`);
    }
    const data = (await res.json()) as VaultKvResponse;
    return data.data.data;
  }

  /** Read multiple paths and merge into one object. */
  async readAll(paths: string[]): Promise<Record<string, string>> {
    const results = await Promise.all(paths.map((p) => this.read(p)));
    return Object.assign({}, ...results);
  }
}

/** Product-specific secret paths in Vault. */
export function vaultPaths(slug: string): string[] {
  return [
    `${slug}/prod`,
    `${slug}/stripe`,
    "shared/openrouter",
    "shared/postmark",
    "shared/resend",
    "shared/digitalocean",
    "shared/github",
    "shared/ghcr",
    "shared/cloudflare",
    "shared/registry",
  ];
}

/**
 * Resolve Vault config from environment.
 * Returns null if VAULT_ADDR is not set (local dev mode).
 */
export function resolveVaultConfig(): VaultConfig | null {
  const addr = process.env.VAULT_ADDR;
  if (!addr) return null;

  const roleId = process.env.VAULT_ROLE_ID;
  const secretId = process.env.VAULT_SECRET_ID;

  if (!roleId || !secretId) {
    throw new Error("VAULT_ADDR is set but VAULT_ROLE_ID or VAULT_SECRET_ID is missing");
  }

  return { addr, roleId, secretId };
}
