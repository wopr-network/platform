/**
 * Core-client wrapper — holyship delegates billing/org/fleet to the core server.
 *
 * Uses CORE_SERVICE_TOKEN from env. Set in compose from .env's
 * HOLYSHIP_SERVICE_TOKEN, which is a value also present in core's
 * CORE_ALLOWED_SERVICE_TOKENS list (verified on prod).
 *
 * Earlier this file tried to prefer Vault holyship/prod.platform_service_key
 * over the env var. That was wrong — Vault's platform_service_key is NOT in
 * core's allowedServiceTokens (different value entirely), and signing with
 * it caused every fleet.createContainer call to be rejected at
 * internalServiceAuth. The env var IS the right shared secret.
 */
import { createCoreClient } from "@wopr-network/core-client";

const CORE_URL = process.env.CORE_URL ?? "http://core:3001";
const serviceToken = process.env.CORE_SERVICE_TOKEN ?? "";

if (!serviceToken) {
  // biome-ignore lint/suspicious/noConsole: boot-time diagnostic
  console.warn(
    "[core-client] CORE_SERVICE_TOKEN env is empty — core API calls will fail with 401",
  );
}

export const coreClient = createCoreClient({
  url: CORE_URL,
  serviceToken,
});
