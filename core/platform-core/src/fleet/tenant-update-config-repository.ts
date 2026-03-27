export interface TenantUpdateConfig {
  tenantId: string;
  mode: "auto" | "manual";
  preferredHourUtc: number;
  updatedAt: number;
}

export interface ITenantUpdateConfigRepository {
  get(tenantId: string): Promise<TenantUpdateConfig | null>;
  upsert(tenantId: string, config: Omit<TenantUpdateConfig, "tenantId" | "updatedAt">): Promise<void>;
  listAutoEnabled(): Promise<TenantUpdateConfig[]>;
}
