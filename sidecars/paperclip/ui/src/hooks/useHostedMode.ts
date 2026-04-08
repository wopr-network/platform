import { useQuery } from "@tanstack/react-query";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";

export function useHostedMode() {
  const { data: health } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    isHosted: health?.deploymentMode === "hosted_proxy",
  };
}
