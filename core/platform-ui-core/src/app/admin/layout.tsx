"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminNav } from "@/components/admin/admin-nav";
import { Sidebar } from "@/components/sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop only -- admin requires 1024px+ */}
      <div className="hidden lg:flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-auto">
          <AdminGuard>
            <AdminNav />
            <AnimatePresence mode="wait">
              <motion.main
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex-1 overflow-auto"
              >
                {children}
              </motion.main>
            </AnimatePresence>
          </AdminGuard>
        </div>
      </div>

      {/* Mobile/tablet -- show desktop-required message */}
      <div className="flex lg:hidden h-screen items-center justify-center p-6">
        <p className="text-center text-sm text-muted-foreground">
          Admin panel requires desktop. Minimum width: 1024px.
        </p>
      </div>
    </>
  );
}
