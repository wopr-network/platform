/**
 * Core-client wrapper — holyship delegates billing/org/fleet to the core server.
 *
 * Token resolution at module load:
 *   1. Vault `holyship/prod.platform_service_key` (5s timeout)
 *   2. process.env.CORE_SERVICE_TOKEN
 *   3. Empty string fallback — coreClient is still constructed so the import
 *      chain (HolyshipperFleetManager → WorkerPool) doesn't break; calls
 *      against an empty token will fail at the auth middleware with a clear
 *      401 instead of silently killing worker-pool registration.
 */
import { createCoreClient } from "@wopr-network/core-client";
import { resolveVaultConfig, VaultClient } from "@wopr-network/vault-client";

const CORE_URL = process.env.CORE_URL ?? "http://core:3001";

async function resolveServiceToken(): Promise<string> {
  const vaultRead = (async (): Promise<string | null> => {
    try {
      const vaultConfig = resolveVaultConfig();
      if (!vaultConfig) return null;
      const vault = new VaultClient(vaultConfig);
      const secret = await vault.read("holyship/prod").catch(() => ({}));
      return (secret as { platform_service_key?: string }).platform_service_key ?? null;
    } catch {
      return null;
    }
  })();
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
  const vaultToken = await Promise.race([vaultRead, timeout]);
  if (vaultToken) return vaultToken;
  return process.env.CORE_SERVICE_TOKEN ?? "";
}

const serviceToken = await resolveServiceToken();

if (!serviceToken) {
  // biome-ignore lint/suspicious/noConsole: boot-time diagnostic
  console.warn(
    "[core-client] no service token resolved (Vault holyship/prod.platform_service_key + CORE_SERVICE_TOKEN both empty) — core API calls will fail with 401",
  );
}

export const coreClient = createCoreClient({
  url: CORE_URL,
  serviceToken,
});
