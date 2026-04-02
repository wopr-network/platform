"use client";

import { BuildingIcon, UserIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { TenantOption } from "@/lib/tenant-context";
import { useTenant } from "@/lib/tenant-context";

function FallbackIcon({ tenant, size }: { tenant: TenantOption; size: number }) {
  const Icon = tenant.type === "org" ? BuildingIcon : UserIcon;
  return (
    <span
      className="flex items-center justify-center rounded-full bg-sidebar-accent"
      style={{ width: size, height: size }}
    >
      <Icon className="size-3 text-muted-foreground" />
    </span>
  );
}

function TenantAvatar({ tenant, size = 20 }: { tenant: TenantOption; size?: number }) {
  const [imgError, setImgError] = useState(false);

  if (tenant.image && !imgError) {
    return (
      <Image
        src={tenant.image}
        alt={tenant.name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }
  return <FallbackIcon tenant={tenant} size={size} />;
}

export function AccountSwitcher() {
  const { activeTenantId, tenants, isLoading } = useTenant();

  if (isLoading || tenants.length === 0) return null;

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? tenants[0];

  return (
    <div className="border-b border-sidebar-border px-3 py-1">
      <div className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium">
        <TenantAvatar tenant={activeTenant} />
        <span className="flex-1 truncate text-left text-sidebar-foreground">{activeTenant.name}</span>
      </div>
    </div>
  );
}
