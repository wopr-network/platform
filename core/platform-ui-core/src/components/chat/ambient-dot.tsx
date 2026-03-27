"use client";

import { motion } from "framer-motion";
import { brandName } from "@/lib/brand-config";

interface AmbientDotProps {
  hasUnread: boolean;
  onClick: () => void;
}

export function AmbientDot({ hasUnread, onClick }: AmbientDotProps) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/20 backdrop-blur-sm"
      whileHover={{ scale: 1.1, backgroundColor: "rgba(0, 255, 65, 0.3)" }}
      whileTap={{ scale: 0.95 }}
      aria-label={`Open ${brandName()} chat`}
      data-testid="chat-ambient-dot"
    >
      <div className="h-3 w-3 rounded-full bg-terminal" />
      {hasUnread && (
        <motion.div
          data-testid="chat-unread-pulse"
          className="absolute inset-0 rounded-full border-2 border-terminal"
          animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
      )}
    </motion.button>
  );
}
