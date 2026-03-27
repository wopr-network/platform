"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { getDiscoveryQueue } from "@/lib/admin-marketplace-api";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { label: "Users", href: "/admin/tenants" },
  { label: "Accounting", href: "/admin/accounting" },
  { label: "Billing Health", href: "/admin/billing-health" },
  { label: "Audit Log", href: "/admin/audit" },
  { label: "Compliance", href: "/admin/compliance" },
  { label: "Marketplace", href: "/admin/marketplace" },
  { label: "Inference", href: "/admin/inference" },
  { label: "Promotions", href: "/admin/promotions" },
  { label: "Rate Overrides", href: "/admin/rate-overrides" },
  { label: "Affiliates", href: "/admin/affiliates" },
  { label: "Onboarding", href: "/admin/onboarding" },
  { label: "Roles", href: "/admin/roles" },
  { label: "Migrations", href: "/admin/migrations" },
  { label: "GPU", href: "/admin/gpu" },
  { label: "Fleet Updates", href: "/admin/fleet-updates" },
  { label: "Pool", href: "/admin/pool-config" },
  { label: "Incidents", href: "/admin/incidents" },
];

export function AdminNav() {
  const pathname = usePathname();
  const [queueCount, setQueueCount] = useState(0);

  const loadQueueCount = useCallback(async () => {
    try {
      const queue = await getDiscoveryQueue();
      setQueueCount(queue.length);
    } catch {
      // keep previous count
    }
  }, []);

  useEffect(() => {
    loadQueueCount();
  }, [loadQueueCount]);

  return (
    <nav className="flex gap-1 border-b border-border px-6 py-2">
      {adminNavItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent inline-flex items-center gap-1.5",
            pathname.startsWith(item.href)
              ? "bg-terminal/10 text-terminal"
              : "text-muted-foreground",
          )}
        >
          {item.label}
          {item.label === "Marketplace" && queueCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-xs px-1.5 py-0"
            >
              {queueCount}
            </Badge>
          )}
        </Link>
      ))}
    </nav>
  );
}
