"use client";

import { motion } from "framer-motion";
import {
  BellIcon,
  BrainIcon,
  BuildingIcon,
  HistoryIcon,
  KeyIcon,
  KeyRoundIcon,
  LockKeyholeIcon,
  MenuIcon,
  ServerIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useHasOrg } from "@/hooks/use-has-org";
import { cn } from "@/lib/utils";

const settingsNav = [
  { label: "Profile", href: "/settings/profile", icon: UserIcon },
  { label: "Account", href: "/settings/account", icon: KeyRoundIcon },
  { label: "Security", href: "/settings/security", icon: ShieldIcon },
  { label: "Brain", href: "/settings/brain", icon: BrainIcon },
  { label: "Provider Keys", href: "/settings/providers", icon: ServerIcon },
  { label: "API Keys", href: "/settings/api-keys", icon: KeyIcon },
  { label: "Secrets", href: "/settings/secrets", icon: LockKeyholeIcon },
  { label: "Organization", href: "/settings/org", icon: BuildingIcon },
  { label: "Notifications", href: "/settings/notifications", icon: BellIcon },
  { label: "Activity", href: "/settings/activity", icon: HistoryIcon },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { hasOrg } = useHasOrg();

  const visibleNav = settingsNav.filter((item) => item.href !== "/settings/org" || hasOrg);

  return (
    <ul className="space-y-1">
      {visibleNav.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <li key={item.href} className="relative">
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "relative flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors hover:text-accent-foreground",
                isActive ? "text-accent-foreground" : "text-muted-foreground",
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="settings-active-indicator"
                  className="absolute inset-0 rounded-sm bg-accent"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Icon className="size-4" />
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Mobile header */}
      <div className="flex items-center gap-2 border-b p-4 md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm">
              <MenuIcon className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-56 p-0">
            <nav className="p-4">
              <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Settings</h2>
              <NavList onNavigate={() => setSheetOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
        <h2 className="text-sm font-semibold">Settings</h2>
      </div>

      {/* Desktop sidebar */}
      <nav className="hidden w-48 shrink-0 border-r p-4 md:block">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Settings</h2>
        <NavList />
      </nav>

      <div className="flex-1 overflow-auto p-4 md:p-6">{children}</div>
    </div>
  );
}
