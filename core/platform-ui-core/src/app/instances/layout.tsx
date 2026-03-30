"use client";

import { useRequireAuth } from "@/lib/require-auth";

export default function InstancesLayout({ children }: { children: React.ReactNode }) {
  const { isPending, isAuthed } = useRequireAuth();
  if (isPending || !isAuthed) return null;
  return <>{children}</>;
}
