"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

interface AuthErrorProps {
  message: string;
}

export function AuthError({ message }: AuthErrorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-2 rounded-sm border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </motion.div>
  );
}
