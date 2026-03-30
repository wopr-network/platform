/**
 * Core-client wrapper — holyship delegates billing/org/fleet to the core server.
 */
import { createCoreClient } from "@wopr-network/core-client";

const CORE_URL = process.env.CORE_URL ?? "http://core:3001";
const CORE_SERVICE_TOKEN = process.env.CORE_SERVICE_TOKEN ?? "";

export const coreClient = createCoreClient({
  url: CORE_URL,
  serviceToken: CORE_SERVICE_TOKEN,
});
