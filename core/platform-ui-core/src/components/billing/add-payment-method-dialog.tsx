"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { AnimatePresence, motion } from "framer-motion";
import { CreditCardIcon, LockIcon, ShieldCheckIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createSetupIntent } from "@/lib/api";
import { logger } from "@/lib/logger";
import { createOrgSetupIntent } from "@/lib/org-billing-api";

const log = logger("billing:add-payment-method");

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!stripePublishableKey) {
  log.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. Stripe Elements will not load.");
}
const stripePromise = loadStripe(stripePublishableKey ?? "");

interface AddPaymentMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  orgId?: string;
  returnUrl?: string;
}

export function AddPaymentMethodDialog({
  open,
  onOpenChange,
  onSuccess,
  orgId,
  returnUrl = "/billing/payment",
}: AddPaymentMethodDialogProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSetupIntent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = orgId ? await createOrgSetupIntent(orgId) : await createSetupIntent();
      setClientSecret(result.clientSecret);
    } catch {
      setError("Failed to initialize payment form. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (open) {
      fetchSetupIntent();
    } else {
      setClientSecret(null);
      setError(null);
    }
  }, [open, fetchSetupIntent]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{orgId ? "Add org payment method" : "Add payment method"}</DialogTitle>
          <DialogDescription>
            Your card details are handled securely by Stripe. We never see or store your card
            number.
          </DialogDescription>
        </DialogHeader>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <LockIcon className="size-3" />
            256-bit SSL
          </span>
          <span className="flex items-center gap-1">
            <ShieldCheckIcon className="size-3" />
            PCI compliant
          </span>
          <span className="flex items-center gap-1">
            <CreditCardIcon className="size-3" />
            Powered by Stripe
          </span>
        </div>

        {/* Content area with skeleton / elements / error transitions */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              <Skeleton className="h-10 w-full rounded-sm" />
              <div className="flex gap-3">
                <Skeleton className="h-10 w-1/2 rounded-sm" />
                <Skeleton className="h-10 w-1/2 rounded-sm" />
              </div>
              <Skeleton className="h-10 w-full rounded-sm" />
            </motion.div>
          )}

          {error && !loading && !clientSecret && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchSetupIntent}>
                Try again
              </Button>
            </motion.div>
          )}

          {clientSecret && !loading && (
            <motion.div
              key="elements"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "night",
                    variables: {
                      colorPrimary: "#00ff41",
                      colorBackground: "#0a0a0a",
                      colorText: "#ffffff",
                      colorTextSecondary: "#a0a0a0",
                      colorDanger: "#ff3333",
                      borderRadius: "4px",
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSizeBase: "14px",
                    },
                    rules: {
                      ".Input:focus": {
                        borderColor: "#00ff41",
                        boxShadow: "0 0 8px 0 rgba(0, 255, 65, 0.2)",
                      },
                    },
                  },
                }}
              >
                <SetupForm
                  onSuccess={() => {
                    onOpenChange(false);
                    onSuccess();
                  }}
                  onCancel={() => onOpenChange(false)}
                  returnUrl={returnUrl}
                />
              </Elements>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer shown only during loading/error (SetupForm has its own footer) */}
        {(loading || (error && !clientSecret)) && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="terminal" disabled>
              Save card
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SetupForm({
  onSuccess,
  onCancel,
  returnUrl,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  returnUrl: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${returnUrl}`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message ?? "Something went wrong.");
      setSubmitting(false);
    } else {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-sm text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <AnimatePresence mode="wait">
          <motion.div key={submitting ? "saving" : "save"}>
            <Button type="submit" variant="terminal" disabled={!stripe || submitting}>
              {submitting && (
                <span className="size-3.5 animate-spin rounded-full border-2 border-terminal border-t-transparent" />
              )}
              {submitting ? "Saving..." : "Save card"}
            </Button>
          </motion.div>
        </AnimatePresence>
      </DialogFooter>
    </form>
  );
}
