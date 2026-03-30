/**
 * Resolve platform secrets at boot time.
 *
 * Production: reads from Vault via AppRole auth.
 * Local dev: returns dev defaults (VAULT_ADDR not set).
 *
 * Call once at the top of platformBoot(), before any service construction.
 */

import type { PlatformSecrets } from "./secrets.js";
import { mapSecretsFromPaths, secretsFromEnv } from "./secrets.js";
import { resolveVaultConfig, VaultConfigProvider, vaultPaths } from "./vault-provider.js";

export async function resolveSecrets(slug: string): Promise<PlatformSecrets> {
  const vaultConfig = resolveVaultConfig();

  if (!vaultConfig) {
    return secretsFromEnv();
  }
  const vault = new VaultConfigProvider(vaultConfig);

  // Read each path individually to avoid key collisions
  // (e.g. webhook_secret exists in both stripe and github paths)
  const paths = vaultPaths(slug);
  const results = await Promise.all(paths.map((p) => vault.read(p).catch(() => ({}) as Record<string, string>)));

  const bySegment: Record<string, Record<string, string>> = {};
  let _totalKeys = 0;
  for (let i = 0; i < paths.length; i++) {
    const segment = paths[i].split("/").pop() ?? paths[i];
    bySegment[segment] = results[i];
    _totalKeys += Object.keys(results[i]).length;
  }
  return mapSecretsFromPaths(bySegment);
}
