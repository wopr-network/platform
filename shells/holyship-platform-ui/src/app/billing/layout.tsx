"use client";

import CoreBillingLayout from "@core/app/(dashboard)/billing/layout";
import { useRequireAuth } from "@core/lib/require-auth";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  const { isPending, isAuthed } = useRequireAuth();
  if (isPending || !isAuthed) return null;
  return <CoreBillingLayout>{children}</CoreBillingLayout>;
}
