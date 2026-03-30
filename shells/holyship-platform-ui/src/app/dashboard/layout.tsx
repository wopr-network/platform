"use client";

import { useRequireAuth } from "@core/lib/require-auth";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isPending, isAuthed } = useRequireAuth();
  if (isPending || !isAuthed) return null;
  return <>{children}</>;
}
