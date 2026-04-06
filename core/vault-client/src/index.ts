/**
 * @wopr-network/vault-client — standalone Vault secret resolution.
 *
 * Any service can import this to resolve secrets from Vault at boot.
 * Zero external dependencies — just fetch.
 */

export { VaultClient, resolveVaultConfig, vaultPaths } from "./vault.js";
export type { VaultConfig } from "./vault.js";
export { devSecrets, mapSecretsFromPaths } from "./secrets.js";
export type { PlatformSecrets } from "./secrets.js";

import { mapSecretsFromPaths } from "./secrets.js";
import { devSecrets } from "./secrets.js";
import { VaultClient, resolveVaultConfig, vaultPaths } from "./vault.js";

/**
 * Resolve secrets for a product. Production reads from Vault,
 * local dev returns dev defaults.
 */
export async function resolveSecrets(slug: string) {
  const vaultConfig = resolveVaultConfig();

  if (!vaultConfig) {
    return devSecrets();
  }

  const vault = new VaultClient(vaultConfig);
  const paths = vaultPaths(slug);
  const results = await Promise.all(paths.map((p) => vault.read(p).catch(() => ({}) as Record<string, string>)));

  const bySegment: Record<string, Record<string, string>> = {};
  for (let i = 0; i < paths.length; i++) {
    const segment = paths[i].split("/").pop() ?? paths[i];
    bySegment[segment] = results[i];
  }
  return mapSecretsFromPaths(bySegment);
}
