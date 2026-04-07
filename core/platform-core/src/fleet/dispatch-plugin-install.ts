import { logger } from "../config/logger.js";

/**
 * Fetch the resolved dependency list for an installed plugin from the instance.
 * Returns npm package names (e.g., ["@wopr-network/plugin-voice"]).
 * Returns [] on any failure — never throws.
 *
 * @param instanceUrl - The instance's URL from Instance.url
 */
export async function fetchPluginDependencies(instanceUrl: string, pluginName: string): Promise<string[]> {
  const url = `${instanceUrl}/plugins/${pluginName}/health`;
  logger.info("fetchPluginDependencies: checking", { url, pluginName });
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.warn("fetchPluginDependencies: not ok", { url, status: response.status });
      return [];
    }

    const data = (await response.json()) as { manifest?: { dependencies?: string[] } };
    return data.manifest?.dependencies ?? [];
  } catch (err) {
    logger.warn("fetchPluginDependencies: fetch error", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Dispatch a plugin install command to a running instance via direct HTTP.
 * Returns { dispatched: true } on success, { dispatched: false, dispatchError } on failure.
 * Never throws — dispatch failure is non-fatal (plugin will be installed on next restart).
 *
 * @param instanceUrl - The instance's URL from Instance.url
 */
export async function dispatchPluginInstall(
  instanceUrl: string,
  npmPackage: string,
): Promise<{ dispatched: boolean; dispatchError?: string }> {
  const url = `${instanceUrl}/plugins/install`;
  logger.info("dispatchPluginInstall: sending", { url, npmPackage });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: npmPackage }),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      logger.info("dispatchPluginInstall: success", { url, npmPackage });
      return { dispatched: true };
    }

    const errorText = await response.text().catch(() => "Unknown error");
    const msg = `daemon returned ${response.status}: ${errorText}`;
    logger.warn("dispatchPluginInstall: failed", { url, npmPackage, status: response.status, error: msg });
    return { dispatched: false, dispatchError: msg };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("dispatchPluginInstall: fetch error", { url, npmPackage, error: message });
    return { dispatched: false, dispatchError: message };
  }
}
