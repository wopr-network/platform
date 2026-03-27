import { trpcVanilla } from "./trpc";

export interface PoolConfig {
  enabled: boolean;
  poolSize: number;
  warmCount: number;
}

export async function getPoolConfig(): Promise<PoolConfig> {
  return trpcVanilla.admin.getPoolConfig.query({});
}

export async function setPoolSize(size: number): Promise<{ poolSize: number }> {
  return trpcVanilla.admin.setPoolSize.mutate({ size });
}
