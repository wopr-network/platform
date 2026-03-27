"use client";

import { BuildingIcon, CheckIcon, ChevronsUpDownIcon, UserIcon } from "lucide-react";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TenantOption } from "@/lib/tenant-context";
import { useTenant } from "@/lib/tenant-context";

function TenantAvatar({ tenant, size = 20 }: { tenant: TenantOption; size?: number }) {
  if (tenant.image) {
    return (
      <Image
        src={tenant.image}
        alt={tenant.name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
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

export function AccountSwitcher() {
  const { activeTenantId, tenants, isLoading, switchTenant } = useTenant();

  if (isLoading || tenants.length <= 1) return null;

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? tenants[0];

  return (
    <div className="border-b border-sidebar-border px-3 py-1">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring">
          <TenantAvatar tenant={activeTenant} />
          <span className="flex-1 truncate text-left text-sidebar-foreground">
            {activeTenant.name}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-terminal-dim/60">
            {activeTenant.type === "org" ? "ORG" : "PERSONAL"}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <DropdownMenuLabel className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
            Switch account
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tenants.map((tenant) => (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => switchTenant(tenant.id)}
              className="flex items-center gap-2"
            >
              <TenantAvatar tenant={tenant} />
              <span className="flex-1 truncate text-sm">{tenant.name}</span>
              {tenant.id === activeTenantId && (
                <CheckIcon className="size-4 shrink-0 text-terminal" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
