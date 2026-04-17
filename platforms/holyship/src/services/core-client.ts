/**
 * Core-client wrapper — holyship delegates billing/org/fleet to the core server.
 *
 * Token precedence: Vault `holyship/prod.platform_service_key` (authoritative)
 * over `process.env.CORE_SERVICE_TOKEN` (legacy/.env). When Vault is reachable
 * at boot, the engine and core agree on a single source of truth; otherwise
 * we fall back to the env var so hosts without Vault still work.
 *
 * Before this, engine→core fleet.createContainer tRPC calls signed with the
 * .env value, but #119 has core accepting tokens from Vault — the two sides
 * drifted and every provision attempt got `Not authorized for this tenant`.
 */
import { createCoreClient } from "@wopr-network/core-client";
import { resolveVaultConfig, VaultClient } from "@wopr-network/vault-client";

const CORE_URL = process.env.CORE_URL ?? "http://core:3001";

async function resolveServiceToken(): Promise<string> {
  try {
    const vaultConfig = resolveVaultConfig();
    if (vaultConfig) {
      const vault = new VaultClient(vaultConfig);
      const secret = await vault.read("holyship/prod").catch(() => ({}));
      const key = (secret as { platform_service_key?: string }).platform_service_key;
      if (key) return key;
    }
  } catch {
    // fall through to env
  }
  const envToken = process.env.CORE_SERVICE_TOKEN;
  if (envToken) return envToken;
  throw new Error(
    "Neither Vault holyship/prod.platform_service_key nor CORE_SERVICE_TOKEN env is set — holyship cannot talk to core",
  );
}

const serviceToken = await resolveServiceToken();

export const coreClient = createCoreClient({
  url: CORE_URL,
  serviceToken,
});
