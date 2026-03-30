"use client";

import { Sidebar } from "@/components/sidebar";
import { useRequireAuth } from "@/lib/require-auth";

export default function FleetLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { isPending, isAuthed } = useRequireAuth();
  if (isPending || !isAuthed) return null;
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
