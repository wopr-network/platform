"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { InferenceMode } from "@/lib/api";
import { getInferenceMode } from "@/lib/api";
import { cn } from "@/lib/utils";

const billingNav = [
  { label: "Your Plan", href: "/billing/plans", hostedOnly: false },
  { label: "Credits", href: "/billing/credits", hostedOnly: false },
  { label: "Usage", href: "/billing/usage", hostedOnly: false },
  { label: "Hosted Usage", href: "/billing/usage/hosted", hostedOnly: true },
  { label: "Payment", href: "/billing/payment", hostedOnly: false },
  { label: "Refer & Earn", href: "/billing/referrals", hostedOnly: false },
];

export default function BillingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [mode, setMode] = useState<InferenceMode | null>(null);

  useEffect(() => {
    getInferenceMode()
      .then(setMode)
      .catch(() => setMode("hosted"));
  }, []);

  return (
    <div className="flex h-full">
      <nav className="w-48 shrink-0 border-r p-4">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Billing</h2>
        <ul className="space-y-1">
          {billingNav.map((item) => {
            if (item.hostedOnly && mode === "byok") return null;
            return (
              <li key={item.href} className={cn(item.hostedOnly && mode === null && "hidden")}>
                <Link
                  href={item.href}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                    pathname === item.href
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex-1 overflow-auto p-6">
        {children}
        <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          <div className="flex gap-4">
            <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              Privacy Policy
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
