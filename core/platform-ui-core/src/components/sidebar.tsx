"use client";

import {
  CreditCard,
  GitBranch,
  LayoutDashboard,
  LayoutGrid,
  LogOutIcon,
  MessageCircle,
  MessageSquare,
  Network,
  Puzzle,
  Server,
  SettingsIcon,
  Shield,
  Store,
  UserIcon,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AccountSwitcher } from "@/components/account-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { getCreditBalance } from "@/lib/api";
import { signOut, useSession } from "@/lib/auth-client";
import { getBrandConfig, productName } from "@/lib/brand-config";
import { formatCreditStandard } from "@/lib/format-credit";
import { cn } from "@/lib/utils";

function getNavItems() {
  return getBrandConfig().navItems;
}

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/marketplace") return pathname === "/marketplace";
  if (href === "/settings/profile") return pathname.startsWith("/settings");
  if (href === "/billing/plans")
    return pathname.startsWith("/billing") && !pathname.startsWith("/billing/credits");
  if (href === "/billing/credits") return pathname.startsWith("/billing/credits");
  if (href === "/admin/tenants" || href === "/admin") return pathname.startsWith("/admin");
  return pathname.startsWith(href);
}

function balanceColorClass(balance: number): string {
  if (balance === 0) return "text-red-500";
  if (balance < 1) return "text-red-500";
  if (balance <= 2) return "text-amber-500";
  return "text-terminal";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getNavIcon(href: string) {
  if (href === "/dashboard") return LayoutDashboard;
  if (href === "/chat") return MessageCircle;
  if (href === "/marketplace") return Store;
  if (href.startsWith("/channels")) return MessageSquare;
  if (href.startsWith("/plugins")) return Puzzle;
  if (href.startsWith("/instances")) return LayoutGrid;
  if (href.startsWith("/changesets")) return GitBranch;
  if (href.startsWith("/fleet")) return Server;
  if (href.startsWith("/network")) return Network;
  if (href.startsWith("/billing/credits")) return Wallet;
  if (href.startsWith("/billing")) return CreditCard;
  if (href.startsWith("/settings")) return SettingsIcon;
  if (href.startsWith("/admin")) return Shield;
  return null;
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);

  const user = session?.user;

  const loadBalance = useCallback(async () => {
    try {
      const data = await getCreditBalance();
      setCreditBalance(data.balance);
    } catch {
      // Silently fail — balance is non-critical UI decoration
    }
  }, []);

  useEffect(() => {
    if (user) loadBalance();
  }, [user, loadBalance]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Continue to redirect even if signOut throws
    }
    router.push("/login");
  }

  return (
    <div data-slot="sidebar" className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-sidebar-border px-6">
        <span
          className="text-lg font-semibold tracking-tight text-terminal"
          style={{ textShadow: "0 0 12px var(--terminal-glow, rgba(0, 255, 65, 0.4))" }}
        >
          {productName()}
        </span>
      </div>
      <AccountSwitcher />
      <nav className="flex-1 space-y-1 px-3 py-4">
        {getNavItems()
          .filter(
            (item) =>
              !item.href.startsWith("/admin") ||
              (user as { role?: string } | undefined)?.role === "platform_admin",
          )
          .map((item) => {
            const NavIcon = getNavIcon(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={onNavigate}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-foreground",
                  isNavActive(item.href, pathname)
                    ? "bg-terminal/5 border-l-2 border-terminal text-terminal"
                    : "text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-2.5">
                  {NavIcon && <NavIcon className="size-4 shrink-0 opacity-70" />}
                  {item.label}
                </span>
                {item.label === "Credits" && creditBalance !== null && (
                  <span className={cn("text-xs font-mono", balanceColorClass(creditBalance))}>
                    {formatCreditStandard(creditBalance)}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>
      <div className="border-t border-sidebar-border px-3 py-3">
        {isPending ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name ?? "User avatar"}
                  width={32}
                  height={32}
                  className="size-8 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold ring-1 ring-terminal/20">
                  {user.name?.trim() ? getInitials(user.name) : <UserIcon className="size-4" />}
                </span>
              )}
              <span className="truncate">{user.name ?? user.email}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  {user.name && <span className="text-sm font-medium">{user.name}</span>}
                  {user.email && (
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
                <UserIcon />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings/providers")}>
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Link
            href="/login"
            className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside
      data-slot="sidebar"
      className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      <SidebarContent />
    </aside>
  );
}
