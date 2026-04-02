"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleDollarSign, CreditCard } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type CheckoutResult,
  type CreditOption,
  createCheckout,
  createCreditCheckout,
  getChargeStatus,
  getCreditOptions,
  getSupportedPaymentMethods,
  type SupportedPaymentMethod,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { isAllowedRedirectUrl } from "@/lib/validate-redirect-url";
import { ConfirmationTracker } from "./confirmation-tracker";
import { DepositView } from "./deposit-view";
import { PaymentMethodPicker } from "./payment-method-picker";

const PRESETS = [10, 25, 50, 100];
const MIN_AMOUNT = 10;

type Step = "amount" | "method" | "deposit" | "confirming";
type PaymentStatus = "waiting" | "partial" | "confirming" | "credited" | "expired" | "failed";

const slide = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

// ---------------------------------------------------------------------------
// LocalStorage helpers — persist pending crypto charges so users can resume
// ---------------------------------------------------------------------------

function storePendingCharge(result: CheckoutResult) {
  try {
    localStorage.setItem(`pending_charge_${result.referenceId}`, JSON.stringify(result));
  } catch {
    /* quota exceeded — non-critical */
  }
}

function loadPendingCharge(referenceId: string): CheckoutResult | null {
  try {
    const raw = localStorage.getItem(`pending_charge_${referenceId}`);
    return raw ? (JSON.parse(raw) as CheckoutResult) : null;
  } catch {
    return null;
  }
}

function clearPendingCharge(referenceId: string) {
  try {
    localStorage.removeItem(`pending_charge_${referenceId}`);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// UnifiedCheckout — single wizard replacing BuyCreditsPanel + CryptoCheckout
// ---------------------------------------------------------------------------

export function UnifiedCheckout() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Wizard state
  const [step, setStep] = useState<Step>("amount");
  const [amountUsd, setAmountUsd] = useState(0);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [status, setStatus] = useState<PaymentStatus>("waiting");
  const [confirmations, setConfirmations] = useState(0);
  const [confirmationsRequired, setConfirmationsRequired] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Amount input
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");

  // Data sources
  const [creditTiers, setCreditTiers] = useState<CreditOption[]>([]);
  const [cryptoMethods, setCryptoMethods] = useState<SupportedPaymentMethod[]>([]);
  const [dataReady, setDataReady] = useState(false);

  // ── Load Stripe tiers + crypto methods concurrently ────────────────────
  useEffect(() => {
    let mounted = true;
    Promise.allSettled([getCreditOptions(), getSupportedPaymentMethods()]).then(([tiersResult, methodsResult]) => {
      if (!mounted) return;
      if (tiersResult.status === "fulfilled") setCreditTiers(tiersResult.value);
      if (methodsResult.status === "fulfilled") setCryptoMethods(methodsResult.value);
      setDataReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // ── Resume pending crypto charge from URL (?charge=ref_xxx) ────────────
  const chargeRef = searchParams.get("charge");
  useEffect(() => {
    if (!chargeRef) return;
    const stored = loadPendingCharge(chargeRef);
    if (!stored) {
      router.replace(pathname);
      return;
    }
    setCheckout(stored);
    setAmountUsd(stored.amountUsd);
    getChargeStatus(chargeRef)
      .then((res) => {
        setConfirmations(res.confirmations);
        setConfirmationsRequired(res.confirmationsRequired);
        if (res.credited) {
          setStatus("credited");
          setStep("confirming");
          clearPendingCharge(chargeRef);
        } else if (res.status === "expired" || res.status === "failed") {
          setStatus(res.status as PaymentStatus);
          clearPendingCharge(chargeRef);
          setStep("amount");
          router.replace(pathname);
        } else if (res.amountReceivedCents > 0 && res.amountReceivedCents >= res.amountExpectedCents) {
          setStatus("confirming");
          setStep("confirming");
        } else if (res.amountReceivedCents > 0) {
          setStatus("partial");
          setStep("deposit");
        } else {
          setStatus("waiting");
          setStep("deposit");
        }
      })
      .catch(() => {
        clearPendingCharge(chargeRef);
        router.replace(pathname);
      });
  }, [chargeRef, pathname, router]);

  // ── Poll charge status every 5s while on deposit/confirming ────────────
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
          clearPendingCharge(checkout.referenceId);
          clearInterval(interval);
        } else if (res.status === "expired" || res.status === "failed") {
          setStatus(res.status as PaymentStatus);
          clearPendingCharge(checkout.referenceId);
          clearInterval(interval);
        } else if (res.amountReceivedCents > 0 && res.amountReceivedCents >= res.amountExpectedCents) {
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

  // ── Derived state ──────────────────────────────────────────────────────
  const activeAmount = custom ? Number(custom) : selected;
  const isValidAmount = activeAmount != null && activeAmount >= MIN_AMOUNT && Number.isFinite(activeAmount);
  const hasMatchingTier = creditTiers.some((t) => t.amountCents === (activeAmount ?? 0) * 100);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleContinueToMethod = useCallback(() => {
    if (isValidAmount && activeAmount != null) {
      setAmountUsd(activeAmount);
      setStep("method");
    }
  }, [isValidAmount, activeAmount]);

  const handleCardCheckout = useCallback(async () => {
    const tier = creditTiers.find((t) => t.amountCents === amountUsd * 100);
    if (!tier) return;
    setLoading(true);
    setError(null);
    try {
      const { checkoutUrl } = await createCreditCheckout(tier.priceId);
      if (isAllowedRedirectUrl(checkoutUrl)) {
        window.location.href = checkoutUrl;
      } else {
        setError("Unexpected checkout URL.");
        setLoading(false);
      }
    } catch {
      setError("Card checkout failed. Please try again.");
      setLoading(false);
    }
  }, [amountUsd, creditTiers]);

  const handleCryptoMethod = useCallback(
    async (method: SupportedPaymentMethod) => {
      setLoading(true);
      setError(null);
      try {
        const result = await createCheckout(method.id, amountUsd);
        setCheckout(result);
        setStatus("waiting");
        setStep("deposit");
        storePendingCharge(result);
        router.replace(`${pathname}?charge=${result.referenceId}`);
      } catch {
        setError("Crypto checkout failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [amountUsd, pathname, router],
  );

  const handleReset = useCallback(() => {
    if (checkout?.referenceId) clearPendingCharge(checkout.referenceId);
    setStep("amount");
    setCheckout(null);
    setStatus("waiting");
    setAmountUsd(0);
    setConfirmations(0);
    setConfirmationsRequired(0);
    setSelected(null);
    setCustom("");
    router.replace(pathname);
  }, [checkout?.referenceId, pathname, router]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (!dataReady) return null;
  if (creditTiers.length === 0 && cryptoMethods.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-primary" />
            Buy Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {/* ── Step 1: Amount ─────────────────────────────────────── */}
            {step === "amount" && (
              <motion.div key="amount" {...slide}>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PRESETS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setSelected(amt);
                          setCustom("");
                        }}
                        className={cn(
                          "rounded-md border p-3 text-lg font-bold transition-colors hover:bg-accent",
                          selected === amt && !custom
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border",
                        )}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="number"
                    min={MIN_AMOUNT}
                    placeholder="Custom amount ($10 minimum)..."
                    value={custom}
                    onChange={(e) => {
                      setCustom(e.target.value);
                      setSelected(null);
                    }}
                  />
                  <Button onClick={handleContinueToMethod} disabled={!isValidAmount} className="w-full">
                    Continue to payment
                  </Button>
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Payment method ─────────────────────────────── */}
            {step === "method" && (
              <motion.div key="method" {...slide}>
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setStep("amount")}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    &larr; Back
                  </button>

                  <p className="text-center text-sm font-medium">${amountUsd.toFixed(0)}</p>

                  {/* Card (Stripe) */}
                  {hasMatchingTier && (
                    <>
                      <button
                        type="button"
                        onClick={handleCardCheckout}
                        disabled={loading}
                        className="flex w-full items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent hover:border-primary"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                          <CreditCard className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="text-sm font-medium">Pay with Card</div>
                          <div className="text-xs text-muted-foreground">Visa, Mastercard, AMEX &mdash; instant</div>
                        </div>
                      </button>

                      {cryptoMethods.length > 0 && (
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-2 text-muted-foreground">or pay with crypto</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Crypto methods from pay.wopr.bot */}
                  {cryptoMethods.length > 0 && (
                    <PaymentMethodPicker methods={cryptoMethods} onSelect={handleCryptoMethod} />
                  )}

                  {loading && (
                    <p className="mt-2 text-center text-xs text-muted-foreground animate-pulse">Creating checkout...</p>
                  )}
                  {error && <p className="mt-2 text-center text-sm text-destructive">{error}</p>}
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Deposit (crypto only) ──────────────────────── */}
            {step === "deposit" && checkout && (
              <motion.div key="deposit" {...slide}>
                <DepositView checkout={checkout} status={status} onBack={() => setStep("method")} />
              </motion.div>
            )}

            {/* ── Step 4: Confirmation (crypto only) ─────────────────── */}
            {step === "confirming" && checkout && (
              <motion.div key="confirming" {...slide}>
                <ConfirmationTracker
                  confirmations={confirmations}
                  confirmationsRequired={confirmationsRequired}
                  displayAmount={checkout.displayAmount}
                  credited={status === "credited"}
                />
                {status === "credited" && (
                  <button type="button" onClick={handleReset} className="mt-4 text-sm text-primary hover:underline">
                    Done &mdash; buy more credits
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
