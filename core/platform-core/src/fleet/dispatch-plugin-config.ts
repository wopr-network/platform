import { logger } from "../config/logger.js";

/**
 * Dispatch a plugin config update to a running instance via direct HTTP.
 * Returns { dispatched: true } on success, { dispatched: false, dispatchError } on failure.
 * Never throws — dispatch failure is non-fatal (config will be applied on next restart).
 *
 * @param instanceUrl - The instance's URL from Instance.url (e.g. http://containerName:3000)
 */
export async function dispatchPluginConfig(
  instanceUrl: string,
  pluginId: string,
  config: Record<string, unknown>,
): Promise<{ dispatched: boolean; dispatchError?: string }> {
  const url = `${instanceUrl}/plugins/${pluginId}/config`;
  logger.info("dispatchPluginConfig: sending", { url, pluginId });
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      logger.info("dispatchPluginConfig: success", { url, pluginId });
      return { dispatched: true };
    }

    const errorText = await response.text().catch(() => "Unknown error");
    const msg = `daemon returned ${response.status}: ${errorText}`;
    logger.warn("dispatchPluginConfig: failed", { url, pluginId, status: response.status, error: msg });
    return { dispatched: false, dispatchError: msg };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("dispatchPluginConfig: fetch error", { url, pluginId, error: message });
    return { dispatched: false, dispatchError: message };
  }
}
