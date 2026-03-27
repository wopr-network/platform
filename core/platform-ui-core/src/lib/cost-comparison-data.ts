import { getBrandConfig } from "./brand-config";
import type { DiyCostData } from "./onboarding-data";
import { channelPlugins, superpowers } from "./onboarding-data";

export interface DiyCostItem extends DiyCostData {
  capabilityId: string;
}

export interface CostComparisonSummary {
  items: DiyCostItem[];
  totalDiyMonthly: string;
  totalPlatformMonthly: string;
  accountsRequired: number;
  apiKeysRequired: number;
}

// Derived entirely from the capability registries — no parallel map needed.
// Adding diyCostData to a channelPlugin or superpower automatically includes it here.
export const DIY_COSTS: DiyCostItem[] = [
  ...channelPlugins
    .filter((c): c is typeof c & { diyCostData: DiyCostData } => c.diyCostData != null)
    .map((c) => ({ capabilityId: c.id, ...c.diyCostData })),
  ...superpowers
    .filter((s): s is typeof s & { diyCostData: DiyCostData } => s.diyCostData != null)
    .map((s) => ({ capabilityId: s.id, ...s.diyCostData })),
];

export function buildCostComparison(
  selectedChannels: string[],
  selectedSuperpowers: string[],
): CostComparisonSummary {
  const selectedIds = new Set([...selectedChannels, ...selectedSuperpowers]);
  const items = DIY_COSTS.filter((c) => selectedIds.has(c.capabilityId));

  const allAccounts = new Set<string>();
  const allApiKeys = new Set<string>();
  let totalDiyCents = 0;

  for (const item of items) {
    for (const acc of item.accounts) allAccounts.add(acc);
    for (const key of item.apiKeys) allApiKeys.add(key);
    totalDiyCents += item.diyCostNumeric;
  }

  const totalDiy = totalDiyCents / 100;

  return {
    items,
    totalDiyMonthly: totalDiy > 0 ? `$${totalDiy}+` : "$0",
    totalPlatformMonthly: getBrandConfig().price || "$5",
    accountsRequired: allAccounts.size,
    apiKeysRequired: allApiKeys.size,
  };
}
