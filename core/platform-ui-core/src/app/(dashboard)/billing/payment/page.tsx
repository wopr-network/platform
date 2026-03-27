"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  CreditCardIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LockIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AddPaymentMethodDialog } from "@/components/billing/add-payment-method-dialog";
import { ByokCallout } from "@/components/billing/byok-callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditDetailed } from "@/components/ui/credit-detailed";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BillingInfo, Invoice } from "@/lib/api";
import {
  getBillingInfo,
  removePaymentMethod,
  setDefaultPaymentMethod,
  updateBillingEmail,
} from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { brandName } from "@/lib/brand-config";
import { formatCreditStandard } from "@/lib/format-credit";
import { getOrganization } from "@/lib/org-api";
import { getOrgBillingInfo } from "@/lib/org-billing-api";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  paid: "bg-emerald-500/15 text-emerald-500 border-emerald-500/25",
  pending: "bg-yellow-500/15 text-yellow-500 border-yellow-500/25",
  failed: "bg-red-500/15 text-red-500 border-red-500/25",
};

const BRAND_STYLES: Record<string, string> = {
  visa: "bg-blue-600/20 text-blue-400",
  mastercard: "bg-orange-500/20 text-orange-400",
  amex: "bg-sky-500/20 text-sky-400",
};

const staggerItem = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: Math.min(i, 20) * 0.05, duration: 0.3, ease: "easeOut" as const },
  }),
};

export default function PaymentPage() {
  const { data: session } = useSession();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingEmail, setBillingEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [showOrgAddPayment, setShowOrgAddPayment] = useState(false);

  // Org context detection
  const [orgContext, setOrgContext] = useState<{
    orgId: string;
    orgName: string;
    isAdmin: boolean;
  } | null>(null);
  const [orgPaymentMethods, setOrgPaymentMethods] = useState<
    Array<{
      id: string;
      brand: string;
      last4: string;
      expiryMonth: number;
      expiryYear: number;
      isDefault: boolean;
    }>
  >([]);
  const [orgInvoices, setOrgInvoices] = useState<Invoice[]>([]);
  const [orgChecked, setOrgChecked] = useState(false);
  const [orgLoading, setOrgLoading] = useState(false);

  useEffect(() => {
    getOrganization()
      .then((org) => {
        const currentMember = org.members.find((m) => m.email === session?.user?.email);
        const ctx = {
          orgId: org.id,
          orgName: org.name,
          isAdmin: currentMember?.role === "owner" || currentMember?.role === "admin",
        };
        setOrgContext(ctx);
        setOrgLoading(true);
        getOrgBillingInfo(org.id)
          .then((data) => {
            setOrgPaymentMethods(data.paymentMethods);
            setOrgInvoices(data.invoices);
          })
          .catch(() => {
            // Silently degrade — payment methods and invoices default to empty
          })
          .finally(() => setOrgLoading(false));
      })
      .catch(() => {
        // Silently degrade — org billing section will not render
      })
      .finally(() => setOrgChecked(true));
  }, [session?.user?.email]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBillingInfo();
      setInfo(data);
      setBillingEmail(data.email);
    } catch {
      setError("Failed to load billing information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveEmail(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      await updateBillingEmail(billingEmail);
      setSaveMsg("Billing email updated.");
    } catch {
      setSaveMsg("Failed to update billing email.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemovePayment(id: string) {
    setRemoveError(null);
    try {
      await removePaymentMethod(id);
      if (info) {
        setInfo({
          ...info,
          paymentMethods: info.paymentMethods.filter((pm) => pm.id !== id),
        });
      }
    } catch {
      setRemoveError("Failed to remove payment method.");
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await setDefaultPaymentMethod(id);
      if (info) {
        setInfo({
          ...info,
          paymentMethods: info.paymentMethods.map((pm) => ({
            ...pm,
            isDefault: pm.id === id,
          })),
        });
      }
    } catch {
      setRemoveError("Failed to update default payment method.");
    }
  }

  function toggleInvoiceDetail(invoiceId: string) {
    setExpandedInvoice(expandedInvoice === invoiceId ? null : invoiceId);
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="rounded-sm border p-6 space-y-4">
          <Skeleton className="h-5 w-36" />
          {["sk-pay-a", "sk-pay-b"].map((skId) => (
            <div key={skId} className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-12" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-sm border p-6 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm text-destructive">{error ?? "Unable to load billing information."}</p>
        <Button variant="outline" size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payment</h1>
        <p className="text-sm text-muted-foreground">
          Manage your payment methods and view billing history
        </p>
      </div>

      <ByokCallout compact />

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>
            Cards on file for {brandName()} platform charges (not AI provider costs)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {info.paymentMethods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payment methods on file.</p>
          ) : (
            <div className="space-y-3">
              {info.paymentMethods.map((pm) => {
                const brandClass =
                  BRAND_STYLES[pm.brand.toLowerCase()] ?? "bg-muted text-muted-foreground";
                return (
                  <div
                    key={pm.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-8 w-12 items-center justify-center rounded text-xs font-medium",
                          brandClass,
                        )}
                      >
                        {pm.brand}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          **** **** **** {pm.last4}
                          {pm.isDefault && (
                            <Badge variant="outline" className="ml-2">
                              Default
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Expires {String(pm.expiryMonth).padStart(2, "0")}/{pm.expiryYear}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!pm.isDefault && (
                        <Button variant="ghost" size="sm" onClick={() => handleSetDefault(pm.id)}>
                          Set as default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleRemovePayment(pm.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <AnimatePresence>
            {removeError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {removeError}
              </motion.div>
            )}
          </AnimatePresence>
          <Button variant="outline" onClick={() => setShowAddPayment(true)}>
            Add payment method
          </Button>
          <AddPaymentMethodDialog
            open={showAddPayment}
            onOpenChange={setShowAddPayment}
            onSuccess={load}
          />
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
        </CardContent>
      </Card>

      {/* Billing Email */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Email</CardTitle>
          <CardDescription>Where we send invoices and billing notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveEmail} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="billing-email">Email address</Label>
              <Input
                id="billing-email"
                type="email"
                value={billingEmail}
                onChange={(e) => setBillingEmail(e.target.value)}
                required
              />
            </div>
            {saveMsg && <p className="text-sm text-muted-foreground">{saveMsg}</p>}
            <Button type="submit" className="w-fit" disabled={saving}>
              {saving ? "Saving..." : "Save email"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Org Payment Methods (when in org context) */}
      {orgChecked && orgContext && (
        <Card>
          <CardHeader>
            <CardTitle>Org Payment Methods</CardTitle>
            <CardDescription>
              Cards on file for org-level charges ({orgContext.orgName})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orgLoading ? (
              <div className="space-y-3">
                {["sk-org-a", "sk-org-b"].map((skId) => (
                  <div
                    key={skId}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            ) : orgPaymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No org payment methods on file.</p>
            ) : (
              <div className="space-y-3">
                {orgPaymentMethods.map((pm) => (
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
                  </div>
                ))}
              </div>
            )}
            {orgContext.isAdmin && (
              <>
                <Button variant="outline" onClick={() => setShowOrgAddPayment(true)}>
                  Add org payment method
                </Button>
                <AddPaymentMethodDialog
                  open={showOrgAddPayment}
                  onOpenChange={setShowOrgAddPayment}
                  onSuccess={() => {
                    setOrgLoading(true);
                    getOrgBillingInfo(orgContext.orgId)
                      .then((data) => {
                        setOrgPaymentMethods(data.paymentMethods);
                        setOrgInvoices(data.invoices);
                      })
                      .catch(() => {
                        /* refresh failed — stale data is acceptable */
                      })
                      .finally(() => setOrgLoading(false));
                  }}
                  orgId={orgContext.orgId}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Org Billing History */}
      {orgChecked && orgContext && (
        <Card>
          <CardHeader>
            <CardTitle>Org Billing History</CardTitle>
            <CardDescription>Past invoices for {orgContext.orgName}</CardDescription>
          </CardHeader>
          <CardContent>
            {orgLoading ? (
              <div className="space-y-3">
                {["sk-oinv-a", "sk-oinv-b"].map((skId) => (
                  <div
                    key={skId}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : orgInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No org invoices yet.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[140px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgInvoices.map((invoice, index) => (
                      <motion.tr
                        key={invoice.id}
                        variants={staggerItem}
                        initial="hidden"
                        animate="visible"
                        custom={index}
                        className="border-b transition-colors hover:bg-muted/50"
                      >
                        <TableCell className="font-medium">
                          {new Date(invoice.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                        <TableCell>{formatCreditStandard(invoice.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusStyles[invoice.status]}>
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {invoice.downloadUrl ? (
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={invoice.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <DownloadIcon className="mr-1 size-3" />
                                Download PDF
                              </a>
                            </Button>
                          ) : invoice.hostedUrl ? (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={invoice.hostedUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLinkIcon className="mr-1 size-3" />
                                View in Stripe
                              </a>
                            </Button>
                          ) : null}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Billing History */}
      <div>
        <h2 className="text-lg font-semibold">Billing History</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Past invoices for {brandName()} platform services
        </p>
      </div>

      {info.invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[140px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {info.invoices.map((invoice, index) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  index={index}
                  expanded={expandedInvoice === invoice.id}
                  onToggle={() => toggleInvoiceDetail(invoice.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function InvoiceRow({
  invoice,
  index,
  expanded,
  onToggle,
}: {
  invoice: Invoice;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasLineItems = invoice.hostedLineItems && invoice.hostedLineItems.length > 0;

  return (
    <>
      <motion.tr
        variants={staggerItem}
        initial="hidden"
        animate="visible"
        custom={index}
        className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
      >
        <TableCell className="font-medium">
          {new Date(invoice.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </TableCell>
        <TableCell>{formatCreditStandard(invoice.amount)}</TableCell>
        <TableCell>
          <Badge variant="outline" className={statusStyles[invoice.status]}>
            {invoice.status}
          </Badge>
        </TableCell>
        <TableCell className="flex gap-1">
          {hasLineItems && (
            <Button variant="ghost" size="sm" onClick={onToggle}>
              {expanded ? "Hide" : "Details"}
            </Button>
          )}
          {invoice.downloadUrl ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={invoice.downloadUrl} target="_blank" rel="noopener noreferrer">
                <DownloadIcon className="mr-1 size-3" />
                Download PDF
              </a>
            </Button>
          ) : invoice.hostedUrl ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={invoice.hostedUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="mr-1 size-3" />
                View in Stripe
              </a>
            </Button>
          ) : null}
        </TableCell>
      </motion.tr>
      <tr className="border-0">
        <td colSpan={4} className="p-0">
          <AnimatePresence>
            {expanded && hasLineItems && (
              <motion.div
                key="invoice-detail"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="bg-muted/50 p-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Hosted Usage Line Items
                  </p>
                  <div className="space-y-1 text-xs">
                    {invoice.hostedLineItems?.map((item, i) => (
                      <div key={`${invoice.id}-item-${i}`} className="flex justify-between">
                        <span>
                          {item.capability} — {item.units.toLocaleString()} units @{" "}
                          <CreditDetailed value={item.unitPrice} />
                          /unit
                        </span>
                        <span className="font-medium min-w-[7rem]">
                          <CreditDetailed value={item.total} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </td>
      </tr>
    </>
  );
}
