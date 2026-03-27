"use client";

import { Gift, MoreHorizontal, ShieldBan, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminUserSummary } from "@/lib/admin-api";
import { GrantCreditsDialog } from "./grant-credits-dialog";
import { SuspendDialog } from "./suspend-dialog";

interface TenantRowActionsProps {
  user: AdminUserSummary;
  onAction: () => void;
}

export function TenantRowActions({ user, onAction }: TenantRowActionsProps) {
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-40 transition-opacity duration-100 hover:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 border-terminal/10">
          <DropdownMenuItem onClick={() => setGrantOpen(true)}>
            <Gift className="size-4" />
            Grant Credits
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {user.status === "active" ? (
            <DropdownMenuItem
              onClick={() => setSuspendOpen(true)}
              className="text-amber-500 focus:text-amber-500"
            >
              <ShieldBan className="size-4" />
              Suspend
            </DropdownMenuItem>
          ) : user.status === "suspended" ? (
            <DropdownMenuItem
              onClick={() => setSuspendOpen(true)}
              className="text-terminal focus:text-terminal"
            >
              <ShieldCheck className="size-4" />
              Reactivate
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <SuspendDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        user={user}
        onComplete={onAction}
      />
      <GrantCreditsDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        user={user}
        onComplete={onAction}
      />
    </>
  );
}
