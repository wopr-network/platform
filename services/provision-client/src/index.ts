export type { HealthResponse, ProvisionRequest, ProvisionResponse } from "./client.js";
export { checkHealth, deprovisionContainer, provisionContainer, updateBudget } from "./client.js";
export type { RouteEntry, RouteResolver, TenantProxyOptions } from "./proxy/index.js";
// Re-export proxy utilities for convenience
export { createTenantProxy, extractTenantSubdomain, MemoryRouteTable } from "./proxy/index.js";
