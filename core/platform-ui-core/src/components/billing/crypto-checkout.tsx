"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleDollarSign } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type CheckoutResult,
  createCheckout,
  getChargeStatus,
  getSupportedPaymentMethods,
  type SupportedPaymentMethod,
} from "@/lib/api";
import { AmountSelector } from "./amount-selector";
import { ConfirmationTracker } from "./confirmation-tracker";
import { DepositView } from "./deposit-view";
import { PaymentMethodPicker } from "./payment-method-picker";

type Step = "amount" | "method" | "deposit" | "confirming";
type PaymentStatus = "waiting" | "partial" | "confirming" | "credited" | "expired" | "failed";

export function CryptoCheckout() {
  const [step, setStep] = useState<Step>("amount");
  const [methods, setMethods] = useState<SupportedPaymentMethod[]>([]);
  const [amountUsd, setAmountUsd] = useState(0);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [status, setStatus] = useState<PaymentStatus>("waiting");
  const [confirmations, setConfirmations] = useState(0);
  const [confirmationsRequired, setConfirmationsRequired] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSupportedPaymentMethods()
      .then(setMethods)
      .catch(() => {
        // Silently fail — payment methods are non-critical on mount
      });
  }, []);

  useEffect(() => {
    if (!checkout?.referenceId) return;
    const interval = setInterval(async () => {
      try {
        const res = await getChargeStatus(checkout.referenceId);
        setConfirmations(res.confirmations);
        setConfirmationsRequired(res.confirmationsRequired);
        if (res.credited) {
          setStatus("credited");
          setStep("confirming");
          clearInterval(interval);
        } else if (res.status === "expired" || res.status === "failed") {
          setStatus(res.status as PaymentStatus);
          clearInterval(interval);
        } else if (
          res.amountReceivedCents > 0 &&
          res.amountReceivedCents >= res.amountExpectedCents
        ) {
          setStatus("confirming");
          setStep("confirming");
        } else if (res.amountReceivedCents > 0) {
          setStatus("partial");
        }
      } catch {
        /* ignore poll errors */
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [checkout?.referenceId]);

  const handleAmount = useCallback((amt: number) => {
    setAmountUsd(amt);
    setStep("method");
  }, []);

  const handleMethod = useCallback(
    async (method: SupportedPaymentMethod) => {
      setLoading(true);
      try {
        const result = await createCheckout(method.id, amountUsd);
        setCheckout(result);
        setStatus("waiting");
        setStep("deposit");
      } catch {
        // Stay on method step
      } finally {
        setLoading(false);
      }
    },
    [amountUsd],
  );

  const handleReset = useCallback(() => {
    setStep("amount");
    setCheckout(null);
    setStatus("waiting");
    setAmountUsd(0);
    setConfirmations(0);
  }, []);

  if (methods.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-primary" />
            Pay with Crypto
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {step === "amount" && (
              <motion.div
                key="amount"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <AmountSelector onSelect={handleAmount} />
              </motion.div>
            )}
            {step === "method" && (
              <motion.div
                key="method"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <PaymentMethodPicker
                  methods={methods}
                  onSelect={handleMethod}
                  onBack={() => setStep("amount")}
                />
                {loading && (
                  <p className="mt-2 text-xs text-muted-foreground animate-pulse">
                    Creating checkout...
                  </p>
                )}
              </motion.div>
            )}
            {step === "deposit" && checkout && (
              <motion.div
                key="deposit"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <DepositView checkout={checkout} status={status} onBack={() => setStep("method")} />
              </motion.div>
            )}
            {step === "confirming" && checkout && (
              <motion.div
                key="confirming"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <ConfirmationTracker
                  confirmations={confirmations}
                  confirmationsRequired={confirmationsRequired}
                  displayAmount={checkout.displayAmount}
                  credited={status === "credited"}
                />
                {status === "credited" && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="mt-4 text-sm text-primary hover:underline"
                  >
                    Done — buy more credits
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
