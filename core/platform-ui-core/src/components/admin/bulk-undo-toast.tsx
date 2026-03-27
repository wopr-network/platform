"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BulkUndoToastProps {
  visible: boolean;
  operationId: string;
  description: string;
  detail: string;
  undoDeadline: number;
  onUndo: (operationId: string) => void;
  onDismiss: () => void;
  isUndoing?: boolean;
  /** Total undo window in ms. Defaults to 5 minutes. */
  windowMs?: number;
}

function BulkUndoToast({
  visible,
  operationId,
  description,
  detail,
  undoDeadline,
  onUndo,
  onDismiss,
  isUndoing,
  windowMs = 5 * 60 * 1000,
}: BulkUndoToastProps) {
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, undoDeadline - Date.now()));
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible) return;
    setRemainingMs(Math.max(0, undoDeadline - Date.now()));

    const interval = setInterval(() => {
      const ms = Math.max(0, undoDeadline - Date.now());
      setRemainingMs(ms);
      if (ms <= 0) {
        clearInterval(interval);
        onDismissRef.current();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, undoDeadline]);

  const formatCountdown = useCallback((ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }, []);

  const progressPercent = (remainingMs / windowMs) * 100;

  const barColor =
    remainingMs > 180_000 ? "bg-terminal" : remainingMs > 60_000 ? "bg-amber-500" : "bg-red-500";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 100, opacity: 0, transition: { duration: 0.2 } }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={cn(
            "fixed bottom-4 right-4 z-50 w-80 rounded-sm bg-card border border-terminal/30 shadow-[0_0_20px_rgba(0,255,65,0.1)]",
            "animate-terminal-pulse",
          )}
        >
          <div className="p-4 relative">
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-2 right-2"
              onClick={onDismiss}
              aria-label="Dismiss"
            >
              <X className="size-3" />
            </Button>

            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="size-4 text-terminal shrink-0" />
              <span className="text-sm font-medium text-foreground">{description}</span>
            </div>

            <p className="text-xs text-muted-foreground mb-3">{detail}</p>

            <div className="h-1 w-full bg-muted rounded-full overflow-hidden mb-3">
              <motion.div
                className={cn("h-full rounded-full", barColor)}
                initial={{ width: "100%" }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>

            <Button
              variant="terminal"
              size="sm"
              className="w-full"
              onClick={() => onUndo(operationId)}
              disabled={isUndoing}
            >
              Undo ({formatCountdown(remainingMs)} remaining)
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { BulkUndoToast };
