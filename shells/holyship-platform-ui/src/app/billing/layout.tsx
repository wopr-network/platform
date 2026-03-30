"use client";

import { useRequireAuth } from "@core/lib/require-auth";
import CoreBillingLayout from "@core/app/(dashboard)/billing/layout";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const { isPending, isAuthed } = useRequireAuth();
  if (isPending || !isAuthed) return null;
  return <CoreBillingLayout>{children}</CoreBillingLayout>;
}
