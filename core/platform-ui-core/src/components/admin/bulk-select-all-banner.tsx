"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface BulkSelectAllBannerProps {
  visible: boolean;
  pageCount: number;
  totalMatching: number;
  onSelectAllMatching: () => void;
}

function BulkSelectAllBanner({
  visible,
  pageCount,
  totalMatching,
  onSelectAllMatching,
}: BulkSelectAllBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="w-full py-2 px-4 text-sm text-center bg-terminal/[0.06] border border-terminal/15 rounded-sm"
        >
          All {pageCount} users on this page are selected.{" "}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-terminal font-medium"
            onClick={onSelectAllMatching}
          >
            Select all {totalMatching} matching filters
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { BulkSelectAllBanner };
