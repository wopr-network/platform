"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Download, Gift, ShieldBan, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BulkActionsBarProps {
  selectedCount: number;
  allMatchingSelected: boolean;
  hasSuspendedInSelection: boolean;
  onGrantCredits: () => void;
  onExport: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onClearSelection: () => void;
}

function BulkActionsBar({
  selectedCount,
  allMatchingSelected,
  hasSuspendedInSelection,
  onGrantCredits,
  onExport,
  onSuspend,
  onReactivate,
  onClearSelection,
}: BulkActionsBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-40 h-14 bg-card/95 backdrop-blur-sm border-t border-terminal/20 flex items-center justify-between px-6"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-terminal">{selectedCount} selected</span>
            {allMatchingSelected && (
              <span className="text-sm text-muted-foreground">(all matching filters)</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="terminal" size="sm" onClick={onGrantCredits}>
              <Gift className="size-4" />
              Grant Credits
            </Button>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:border-amber-500"
              onClick={onSuspend}
            >
              <ShieldBan className="size-4" />
              Suspend
            </Button>
            {hasSuspendedInSelection && (
              <Button variant="outline" size="sm" onClick={onReactivate}>
                <ShieldCheck className="size-4" />
                Reactivate
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              <X className="size-4" />
              Clear
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { BulkActionsBar };
