"use client";

import { useCallback, useEffect, useState } from "react";
import { BillingForm } from "@/components/admin/products/billing-form";
import { BrandForm } from "@/components/admin/products/brand-form";
import { FeaturesForm } from "@/components/admin/products/features-form";
import { FleetForm } from "@/components/admin/products/fleet-form";
import { NavEditor } from "@/components/admin/products/nav-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PLATFORM_BASE_URL } from "@/lib/api-config";
import { toUserMessage } from "@/lib/errors";
import { getActiveTenantId } from "@/lib/tenant-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductConfig {
  product: {
    id: string;
    slug: string;
    brandName: string;
    productName: string;
    tagline: string;
    domain: string;
    appDomain: string;
    cookieDomain: string;
    companyLegal: string;
    priceLabel: string;
    defaultImage: string;
    emailSupport: string;
    emailPrivacy: string;
    emailLegal: string;
    fromEmail: string;
    homePath: string;
    storagePrefix: string;
  };
  navItems: Array<{
    id: string;
    label: string;
    href: string;
    icon: string | null;
    sortOrder: number;
    requiresRole: string | null;
    enabled: boolean;
  }>;
  features: {
    chatEnabled: boolean;
    onboardingEnabled: boolean;
    onboardingDefaultModel: string | null;
    onboardingMaxCredits: number;
    onboardingWelcomeMsg: string | null;
    sharedModuleBilling: boolean;
    sharedModuleMonitoring: boolean;
    sharedModuleAnalytics: boolean;
  } | null;
  fleet: {
    containerImage: string;
    containerPort: number;
    lifecycle: string;
    billingModel: string;
    maxInstances: number;
    dockerNetwork: string;
    placementStrategy: string;
    fleetDataDir: string;
  } | null;
  billing: {
    stripePublishableKey: string | null;
    creditPrices: Record<string, number>;
    affiliateBaseUrl: string | null;
    affiliateMatchRate: string;
    affiliateMaxCap: number;
    dividendRate: string;
  } | null;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const tenantId = getActiveTenantId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(tenantId ? { "x-tenant-id": tenantId } : {}),
  };
  return fetch(`${PLATFORM_BASE_URL}/trpc/${path}`, {
    credentials: "include",
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
}

async function fetchProductConfig(): Promise<ProductConfig> {
  const res = await adminFetch("product.admin.get");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { result: { data: ProductConfig } };
  return json.result.data;
}

async function mutateProductConfig(endpoint: string, input: unknown): Promise<void> {
  const res = await adminFetch(`product.admin.${endpoint}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text || `HTTP ${res.status}`);
  }
  const json = (await res.json()) as { error?: { message?: string } };
  if (json.error) {
    throw new Error(json.error.message ?? "Mutation failed");
  }
}

// ---------------------------------------------------------------------------
// Default values for missing optional sections
// ---------------------------------------------------------------------------

const DEFAULT_FEATURES: NonNullable<ProductConfig["features"]> = {
  chatEnabled: false,
  onboardingEnabled: false,
  onboardingDefaultModel: null,
  onboardingMaxCredits: 0,
  onboardingWelcomeMsg: null,
  sharedModuleBilling: false,
  sharedModuleMonitoring: false,
  sharedModuleAnalytics: false,
};

const DEFAULT_FLEET: NonNullable<ProductConfig["fleet"]> = {
  containerImage: "",
  containerPort: 8080,
  lifecycle: "managed",
  billingModel: "none",
  maxInstances: 10,
  dockerNetwork: "platform",
  placementStrategy: "round_robin",
  fleetDataDir: "/data/fleet",
};

const DEFAULT_BILLING: NonNullable<ProductConfig["billing"]> = {
  stripePublishableKey: null,
  creditPrices: {},
  affiliateBaseUrl: null,
  affiliateMatchRate: "0.10",
  affiliateMaxCap: 0,
  dividendRate: "0.05",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AdminProductsPage() {
  const [config, setConfig] = useState<ProductConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchProductConfig();
      setConfig(data);
    } catch (err) {
      setLoadError(toUserMessage(err, "Failed to load product configuration"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError || !config) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 h-64">
        <p className="text-sm text-destructive">{loadError ?? "No configuration found."}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Product Configuration</h1>

      <Tabs defaultValue="brand">
        <TabsList className="mb-4">
          <TabsTrigger value="brand">Brand</TabsTrigger>
          <TabsTrigger value="navigation">Navigation</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="brand">
          <BrandForm initial={config.product} onSave={mutateProductConfig} />
        </TabsContent>

        <TabsContent value="navigation">
          <NavEditor initial={config.navItems} onSave={mutateProductConfig} />
        </TabsContent>

        <TabsContent value="features">
          <FeaturesForm
            initial={config.features ?? DEFAULT_FEATURES}
            onSave={mutateProductConfig}
          />
        </TabsContent>

        <TabsContent value="fleet">
          <FleetForm initial={config.fleet ?? DEFAULT_FLEET} onSave={mutateProductConfig} />
        </TabsContent>

        <TabsContent value="billing">
          <BillingForm initial={config.billing ?? DEFAULT_BILLING} onSave={mutateProductConfig} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
