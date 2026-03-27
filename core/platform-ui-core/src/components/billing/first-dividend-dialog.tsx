"use client";

import { motion } from "framer-motion";
import { SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCountUp } from "@/hooks/use-count-up";
import { brandName, storageKey } from "@/lib/brand-config";
import { formatCreditStandard } from "@/lib/format-credit";

const STORAGE_KEY = storageKey("first_dividend_seen");

interface FirstDividendDialogProps {
  todayAmountCents: number;
}

export function FirstDividendDialog({ todayAmountCents }: FirstDividendDialogProps) {
  const [open, setOpen] = useState(false);
  const [glowActive, setGlowActive] = useState(false);
  const animatedAmount = useCountUp(open ? todayAmountCents / 100 : 0, 800);

  useEffect(() => {
    if (todayAmountCents <= 0) return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setOpen(true);
    }
  }, [todayAmountCents]);

  // Single border glow pulse 200ms after open
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setGlowActive(true), 200);
    return () => clearTimeout(timer);
  }, [open]);

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  }

  if (todayAmountCents <= 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleDismiss();
      }}
    >
      <DialogContent className="sm:max-w-md text-center" showCloseButton={false}>
        <motion.div
          animate={
            glowActive
              ? {
                  boxShadow: [
                    "0 0 0 0 rgba(0, 255, 65, 0)",
                    "0 0 15px 4px rgba(0, 255, 65, 0.2)",
                    "0 0 0 0 rgba(0, 255, 65, 0)",
                  ],
                }
              : {}
          }
          transition={{ duration: 1.5, times: [0, 0.5, 1] }}
          className="contents"
        >
          <DialogHeader className="items-center">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
                delay: 0.1,
              }}
            >
              <SparklesIcon
                className="size-12 text-terminal mx-auto mb-2"
                style={{ filter: "drop-shadow(0 0 20px rgba(0, 255, 65, 0.4))" }}
              />
            </motion.div>
            <DialogTitle className="text-2xl">
              {brandName()} just paid you{" "}
              <span className="font-mono tabular-nums">{formatCreditStandard(animatedAmount)}</span>
            </DialogTitle>
            <DialogDescription>
              This is your community dividend &mdash; a share of the platform&apos;s daily margin,
              distributed equally to all active users. Stay active to keep earning.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-center sm:justify-center">
            <Button variant="terminal" onClick={handleDismiss}>
              Nice.
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
