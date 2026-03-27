"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { BrandWordmark } from "./wopr-wordmark";

interface AuthShellProps {
  children: ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex flex-col items-center">
      <BrandWordmark />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full"
      >
        {children}
      </motion.div>
    </div>
  );
}
