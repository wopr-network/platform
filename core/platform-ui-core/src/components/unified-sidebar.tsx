"use client";

import {
  Bot,
  ChevronRight,
  DollarSign,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  LogOutIcon,
  Plus,
  PlusCircle,
  Repeat,
  SettingsIcon,
  Shield,
  Target,
  UserIcon,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CreditBalanceBadge } from "@/components/billing/credit-balance-badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { type SidebarAgent, type SidebarProject, useSidecarBridge } from "@/hooks/use-sidecar-bridge";
import { signOut, useSession } from "@/lib/auth-client";
import { productName } from "@/lib/brand-config";
import { getRouteType } from "@/lib/sidecar-routes";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function isActive(
  href: string,
  type: "iframe" | "native",
  currentSidecarPath: string | null,
  pathname: string,
): boolean {
  if (type === "iframe") {
    if (!currentSidecarPath) return false;
    if (href === currentSidecarPath) return true;
    return currentSidecarPath.startsWith(`${href}/`);
  }
  // Native routes
  if (href === pathname) return true;
  return pathname.startsWith(`${href}/`);
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav item
// ---------------------------------------------------------------------------

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: React.ReactNode;
  onClick: () => void;
  active: boolean;
}

function NavItem({ icon: Icon, label, href, badge, onClick, active }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-href={href}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-foreground",
        active ? "bg-terminal/5 border-l-2 border-terminal text-terminal" : "text-muted-foreground",
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon className="size-4 shrink-0 opacity-70" />
        {label}
      </span>
      {badge}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Collapsible list section (Projects / Agents)
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, onAdd, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between px-3 pt-4 pb-1">
        <CollapsibleTrigger className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors">
          <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
          {title}
        </CollapsibleTrigger>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Agent status indicator
// ---------------------------------------------------------------------------

function AgentStatusBadge({ agent }: { agent: SidebarAgent }) {
  if (agent.pauseReason === "budget") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono text-amber-500">
        <DollarSign className="size-3" />
      </span>
    );
  }
  if (agent.liveRun) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-mono text-blue-400">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
        </span>
        {agent.liveRunCount > 1 ? agent.liveRunCount : "live"}
      </span>
    );
  }
  if (agent.status === "idle") {
    return <span className="text-[10px] font-mono text-muted-foreground/50">idle</span>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex size-5 items-center justify-center rounded-full bg-terminal/10 text-[10px] font-mono font-semibold text-terminal">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function UnifiedSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { sidebarData, navigate: sidecarNavigate, command, currentSidecarPath } = useSidecarBridge();

  const user = session?.user;
  const isAdmin = (user as { role?: string } | undefined)?.role === "platform_admin";

  // Navigation handler — iframe routes go to sidecar, native routes use router
  function handleNav(href: string) {
    const type = getRouteType(href);
    if (type === "iframe") {
      sidecarNavigate(href);
      window.history.pushState(null, "", href);
    } else {
      router.push(href);
    }
    onNavigate?.();
  }

  function handleCommand(action: string) {
    command(action);
  }

  function checkActive(href: string): boolean {
    const type = getRouteType(href);
    return isActive(href, type, currentSidecarPath, pathname);
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Continue to redirect even if signOut throws
    }
    router.push("/login");
  }

  // Dynamic data from sidecar
  const projects: SidebarProject[] = sidebarData?.projects ?? [];
  const agents: SidebarAgent[] = sidebarData?.agents ?? [];
  const inboxBadge = sidebarData?.inboxBadge ?? 0;
  const liveRunCount = sidebarData?.liveRunCount ?? 0;

  return (
    <div data-slot="sidebar" className="flex h-full flex-col">
      {/* Brand header */}
      <div className="flex h-14 items-center border-b border-sidebar-border px-6">
        <span
          className="text-lg font-semibold tracking-tight text-terminal"
          style={{
            textShadow: "0 0 12px var(--terminal-glow, rgba(0, 255, 65, 0.4))",
          }}
        >
          {productName()}
        </span>
      </div>

      {/* Scrollable nav body */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {/* Quick action */}
        <div className="py-1">
          <button
            type="button"
            onClick={() => handleCommand("openNewIssue")}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <PlusCircle className="size-4 shrink-0 opacity-70" />
            New Issue
          </button>
        </div>

        {/* Primary nav */}
        <div className="space-y-0.5 py-1">
          <NavItem
            icon={LayoutDashboard}
            label="Dashboard"
            href="/dashboard"
            badge={<CountBadge count={liveRunCount} />}
            onClick={() => handleNav("/dashboard")}
            active={checkActive("/dashboard")}
          />
          <NavItem
            icon={Inbox}
            label="Inbox"
            href="/inbox"
            badge={<CountBadge count={inboxBadge} />}
            onClick={() => handleNav("/inbox")}
            active={checkActive("/inbox")}
          />
        </div>

        {/* Work section */}
        <SectionLabel>Work</SectionLabel>
        <div className="space-y-0.5">
          <NavItem
            icon={FolderKanban}
            label="Issues"
            href="/issues"
            onClick={() => handleNav("/issues")}
            active={checkActive("/issues")}
          />
          <NavItem
            icon={Repeat}
            label="Routines"
            href="/routines"
            onClick={() => handleNav("/routines")}
            active={checkActive("/routines")}
          />
          <NavItem
            icon={Target}
            label="Goals"
            href="/goals"
            onClick={() => handleNav("/goals")}
            active={checkActive("/goals")}
          />
        </div>

        {/* Projects — hidden entirely when there are none. The sidecar
            strips projects in hosted mode (see EmbeddedBridge), so an
            empty list is a deliberate signal to suppress the section. */}
        {projects.length > 0 && (
          <CollapsibleSection title="Projects" onAdd={() => handleCommand("openNewProject")}>
            <div className="space-y-0.5 pl-1">
              {projects.map((project) => {
                const href = `/projects/${project.urlKey}/issues`;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleNav(href)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-foreground",
                      checkActive(href)
                        ? "bg-terminal/5 border-l-2 border-terminal text-terminal"
                        : "text-muted-foreground",
                    )}
                  >
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: project.color ?? "var(--muted-foreground)",
                      }}
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                );
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Agents — collapsible, dynamic from sidecar */}
        <CollapsibleSection title="Agents" onAdd={() => handleCommand("openNewAgent")}>
          <div className="space-y-0.5 pl-1">
            {agents.map((agent) => {
              const href = `/agents/${agent.id}`;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => handleNav(href)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-foreground",
                    checkActive(href)
                      ? "bg-terminal/5 border-l-2 border-terminal text-terminal"
                      : "text-muted-foreground",
                  )}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Bot className="size-4 shrink-0 opacity-70" />
                    <span className="truncate">{agent.name}</span>
                  </span>
                  <AgentStatusBadge agent={agent} />
                </button>
              );
            })}
            {agents.length === 0 && (
              <span className="block px-3 py-1.5 text-xs text-muted-foreground/50">No agents yet</span>
            )}
          </div>
        </CollapsibleSection>

        {/* Company section */}
        <SectionLabel>Company</SectionLabel>
        <div className="space-y-0.5">
          <NavItem
            icon={Users}
            label="Org"
            href="/org"
            onClick={() => handleNav("/org")}
            active={checkActive("/org")}
          />
          <NavItem
            icon={Zap}
            label="Skills"
            href="/skills"
            onClick={() => handleNav("/skills")}
            active={checkActive("/skills")}
          />
        </div>

        {/* Account section */}
        <SectionLabel>Account</SectionLabel>
        <div className="space-y-0.5">
          <NavItem
            icon={Wallet}
            label="Credits"
            href="/billing/credits"
            badge={<CreditBalanceBadge />}
            onClick={() => handleNav("/billing/credits")}
            active={checkActive("/billing/credits")}
          />
          <NavItem
            icon={SettingsIcon}
            label="Settings"
            href="/settings"
            onClick={() => handleNav("/settings")}
            active={checkActive("/settings")}
          />
          {isAdmin && (
            <NavItem
              icon={Shield}
              label="Admin"
              href="/admin"
              onClick={() => handleNav("/admin")}
              active={checkActive("/admin")}
            />
          )}
        </div>
      </nav>

      {/* User footer */}
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
                  {user.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
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
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
