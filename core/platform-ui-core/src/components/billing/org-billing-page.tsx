"use client";

import { motion } from "framer-motion";
import { Building2, Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AddPaymentMethodDialog } from "@/components/billing/add-payment-method-dialog";
import { BuyCreditsPanel } from "@/components/billing/buy-credits-panel";
import { BuyCryptoCreditPanel } from "@/components/billing/buy-crypto-credits-panel";
import { CreditBalance } from "@/components/billing/credit-balance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditDetailed } from "@/components/ui/credit-detailed";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toUserMessage } from "@/lib/errors";
import { formatCreditStandard } from "@/lib/format-credit";
import type { OrgCreditBalance, OrgMemberUsageRow } from "@/lib/org-billing-api";
import {
  getOrgBillingInfo,
  getOrgCreditBalance,
  getOrgMemberUsage,
  removeOrgPaymentMethod,
  setOrgDefaultPaymentMethod,
} from "@/lib/org-billing-api";

const stripeBackendReady = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

interface OrgPaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

interface OrgInvoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  downloadUrl: string;
}

interface OrgBillingPageProps {
  orgId: string;
  orgName: string;
  isAdmin: boolean;
}

const invoiceStatusStyles: Record<string, string> = {
  paid: "border-primary/25 text-primary",
  pending: "border-amber-500/25 text-amber-500",
  failed: "border-destructive/25 text-destructive",
};

export function OrgBillingPage({ orgId, orgName, isAdmin }: OrgBillingPageProps) {
  const [balance, setBalance] = useState<OrgCreditBalance | null>(null);
  const [members, setMembers] = useState<OrgMemberUsageRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<OrgPaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<OrgInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [deletingPmId, setDeletingPmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balanceData, usageData, billingData] = await Promise.all([
        getOrgCreditBalance(orgId),
        isAdmin ? getOrgMemberUsage(orgId) : Promise.resolve(null),
        getOrgBillingInfo(orgId),
      ]);
      setBalance(balanceData);
      if (usageData) setMembers(usageData.members);
      setPaymentMethods(billingData.paymentMethods);
      setInvoices(billingData.invoices);
    } catch {
      setError("Failed to load org billing data.");
    } finally {
      setLoading(false);
    }
  }, [orgId, isAdmin]);

  const handleSetDefault = useCallback(
    async (paymentMethodId: string) => {
      setSettingDefault(paymentMethodId);
      setPaymentMethods((pms) =>
        pms.map((pm) => ({ ...pm, isDefault: pm.id === paymentMethodId })),
      );
      try {
        await setOrgDefaultPaymentMethod(orgId, paymentMethodId);
      } catch {
        toast.error("Failed to update default payment method");
        load();
      } finally {
        setSettingDefault(null);
      }
    },
    [orgId, load],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleDeletePaymentMethod = useCallback(
    async (paymentMethodId: string) => {
      setDeleteLoading(true);
      setPaymentMethods((prev) => prev.filter((pm) => pm.id !== paymentMethodId));
      try {
        await removeOrgPaymentMethod(orgId, paymentMethodId);
        toast.success("Payment method removed");
        load();
      } catch (err) {
        toast.error(toUserMessage(err));
        load();
      } finally {
        setDeleteLoading(false);
        setDeletingPmId(null);
      }
    },
    [orgId, load],
  );

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-20 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p>{error ?? "Unable to load org billing."}</p>
        <Button variant="ghost" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  const sectionDelays = {
    balance: 0 * 0.1,
    buyCredits: 1 * 0.1,
    memberUsage: 2 * 0.1,
    paymentMethods: isAdmin ? 3 * 0.1 : 1 * 0.1,
    billingHistory: isAdmin ? 4 * 0.1 : 2 * 0.1,
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Org Context Banner */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-4 py-2"
      >
        <Building2 className="h-4 w-4 text-primary" />
        <p className="text-sm">
          Viewing org billing for <span className="font-bold">{orgName}</span>
        </p>
      </motion.div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Org Credits</h1>
        <p className="text-sm text-muted-foreground">Shared credit pool for {orgName}</p>
      </div>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: sectionDelays.balance, ease: "easeOut" }}
      >
        <CreditBalance
          data={{ balance: balance.balance, dailyBurn: balance.dailyBurn, runway: balance.runway }}
        />
      </motion.div>

      {/* Buy Credits (admin only) */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: sectionDelays.buyCredits, ease: "easeOut" }}
        >
          <BuyCreditsPanel />
          <div className="mt-4">
            <BuyCryptoCreditPanel />
          </div>
        </motion.div>
      )}

      {/* Per-Member Usage (admin only) */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: sectionDelays.memberUsage, ease: "easeOut" }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Per-Member Usage</CardTitle>
              <CardDescription>Credits consumed this billing period</CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No usage data for this billing period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead className="text-right">Credits Used</TableHead>
                        <TableHead className="text-right">Last Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m, index) => (
                        <motion.tr
                          key={m.memberId}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: Math.min(index, 20) * 0.05,
                            duration: 0.3,
                            ease: "easeOut",
                          }}
                          className="border-b transition-colors hover:bg-accent/50"
                        >
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium text-foreground">{m.name}</p>
                              <p className="text-xs text-muted-foreground">{m.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm min-w-[7rem]">
                            <CreditDetailed value={m.creditsConsumed} />
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {m.lastActiveAt ? (
                              new Date(m.lastActiveAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            ) : (
                              <span className="italic text-muted-foreground/60">Never</span>
                            )}
                          </TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Org Payment Methods */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: sectionDelays.paymentMethods, ease: "easeOut" }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Org Payment Methods</CardTitle>
            <CardDescription>Cards on file for org-level charges</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment methods on file.</p>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((pm) => (
                  <div
                    key={pm.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <p className="text-sm font-medium font-mono">
                      **** {pm.last4}
                      {pm.isDefault && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-primary/25 text-primary text-xs"
                        >
                          Default
                        </Badge>
                      )}
                    </p>
                    {isAdmin && !pm.isDefault && paymentMethods.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground hover:text-primary"
                        disabled={settingDefault !== null}
                        onClick={() => handleSetDefault(pm.id)}
                      >
                        {settingDefault === pm.id ? "Setting..." : "Set as default"}
                      </Button>
                    )}
                    {isAdmin && stripeBackendReady && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingPmId(pm.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isAdmin && stripeBackendReady && (
              <>
                <Button variant="outline" className="mt-4" onClick={() => setShowAddPayment(true)}>
                  Add org payment method
                </Button>
                <AddPaymentMethodDialog
                  open={showAddPayment}
                  onOpenChange={setShowAddPayment}
                  onSuccess={load}
                  orgId={orgId}
                  returnUrl="/billing/credits"
                />
              </>
            )}
          </CardContent>
          <AlertDialog
            open={!!deletingPmId}
            onOpenChange={(open) => !open && setDeletingPmId(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Payment Method</AlertDialogTitle>
                <AlertDialogDescription>
                  This payment method will be permanently removed from your organization. This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteLoading}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    if (deletingPmId) handleDeletePaymentMethod(deletingPmId);
                  }}
                >
                  {deleteLoading ? "Removing..." : "Remove"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      </motion.div>

      {/* Billing History */}
      {invoices.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: sectionDelays.billingHistory, ease: "easeOut" }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv, index) => (
                    <motion.tr
                      key={inv.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: Math.min(index, 20) * 0.05,
                        duration: 0.3,
                        ease: "easeOut",
                      }}
                      className="border-b transition-colors hover:bg-accent/50"
                    >
                      <TableCell className="text-sm text-foreground">
                        {new Date(inv.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-foreground">
                        {formatCreditStandard(inv.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={invoiceStatusStyles[inv.status] ?? ""}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={inv.downloadUrl}>
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
