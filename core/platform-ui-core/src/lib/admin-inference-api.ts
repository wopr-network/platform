import { trpcVanilla } from "./trpc";

// ---- Types (mirror backend domain types until SDK is published) ----

export interface DailyCostAggregate {
  day: string; // YYYY-MM-DD
  totalCostUsd: number;
  sessionCount: number;
}

export interface PageCostAggregate {
  page: string;
  totalCostUsd: number;
  callCount: number;
  avgCostUsd: number;
}

export interface CacheStats {
  hitRate: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  uncachedTokens: number;
}

export interface SessionCostSummary {
  totalCostUsd: number;
  totalSessions: number;
  avgCostPerSession: number;
}

// ---- API calls ----

export async function getDailyCost(since: number): Promise<DailyCostAggregate[]> {
  return trpcVanilla.admin.inference.dailyCost.query({ since });
}

export async function getPageCost(since: number): Promise<PageCostAggregate[]> {
  return trpcVanilla.admin.inference.pageCost.query({ since });
}

export async function getCacheStats(since: number): Promise<CacheStats> {
  return trpcVanilla.admin.inference.cacheHitRate.query({ since });
}

export async function getSessionCost(since: number): Promise<SessionCostSummary> {
  return trpcVanilla.admin.inference.sessionCost.query({ since });
}
