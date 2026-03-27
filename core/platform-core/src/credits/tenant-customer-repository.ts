/**
 * Stub interface for tenant-customer repository.
 * The Drizzle implementation lives in the billing module (extracted in Task 12).
 */

export interface TenantCustomerRow {
  tenant: string;
  processor_customer_id: string;
  processor: string;
  tier: string;
  billing_hold: number;
  inference_mode: string;
  created_at: number;
  updated_at: number;
}

export interface ITenantCustomerRepository {
  getByTenant(tenant: string): Promise<TenantCustomerRow | null>;
  getByProcessorCustomerId(processorCustomerId: string): Promise<TenantCustomerRow | null>;
  upsert(row: { tenant: string; processorCustomerId: string; tier?: string }): Promise<void>;
  setTier(tenant: string, tier: string): Promise<void>;
  setBillingHold(tenant: string, hold: boolean): Promise<void>;
  hasBillingHold(tenant: string): Promise<boolean>;
  getInferenceMode(tenant: string): Promise<string>;
  setInferenceMode(tenant: string, mode: string): Promise<void>;
  list(): Promise<TenantCustomerRow[]>;
  buildCustomerIdMap(): Promise<Record<string, string>>;
}
