import { useQuery } from "@tanstack/react-query";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";

export function useHostedMode() {
  const { data: health, isSuccess, isError } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    isHosted: health?.deploymentMode === "hosted_proxy",
    // True once we actually know the deployment mode — useful for callers
    // that want to "fail closed" (hide hosted-only UI) until resolved,
    // rather than briefly flash gated items on first paint.
    modeKnown: isSuccess || isError,
  };
}
