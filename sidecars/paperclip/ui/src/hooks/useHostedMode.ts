import { useQuery } from "@tanstack/react-query";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";

export function useHostedMode() {
  const { data: healthStatus } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
  });

  const isHosted = healthStatus?.hostedMode === true;

  return { isHosted };
}
