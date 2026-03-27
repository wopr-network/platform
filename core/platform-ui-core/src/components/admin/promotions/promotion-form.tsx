"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toUserMessage } from "@/lib/errors";
import type { Promotion, PromotionType, UserSegment, ValueType } from "@/lib/promotions-types";
import { trpcVanilla } from "@/lib/trpc";

const client = trpcVanilla;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PromotionFormProps {
  initialData?: Promotion;
}

export function PromotionForm({ initialData }: PromotionFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialData);

  // Basic
  const [name, setName] = useState(initialData?.name ?? "");
  const [type, setType] = useState<PromotionType>(initialData?.type ?? "bonus_on_purchase");
  const [notes, setNotes] = useState(initialData?.notes ?? "");

  // Value
  const [valueType, setValueType] = useState<ValueType>(initialData?.valueType ?? "flat_credits");
  const [amount, setAmount] = useState(initialData?.amount ?? 0);
  const [cap, setCap] = useState(initialData?.cap ?? 0);

  // Timing
  const [startsImmediately, setStartsImmediately] = useState(!initialData?.startsAt);
  const [startsAt, setStartsAt] = useState(initialData?.startsAt ?? "");
  const [noExpiry, setNoExpiry] = useState(!initialData?.endsAt);
  const [endsAt, setEndsAt] = useState(initialData?.endsAt ?? "");

  // Eligibility
  const [firstPurchaseOnly, setFirstPurchaseOnly] = useState(
    initialData?.firstPurchaseOnly ?? false,
  );
  const [minPurchaseCents, setMinPurchaseCents] = useState(initialData?.minPurchaseCents ?? 0);
  const [userSegment, setUserSegment] = useState<UserSegment>(initialData?.userSegment ?? "all");

  // Limits
  const [unlimited, setUnlimited] = useState(
    initialData ? initialData.totalUseLimit === null : true,
  );
  const [totalUseLimit, setTotalUseLimit] = useState(initialData?.totalUseLimit ?? 1000);
  const [perUserLimit, setPerUserLimit] = useState(initialData?.perUserLimit ?? 1);
  const [noBudgetCap, setNoBudgetCap] = useState(
    initialData ? initialData.budgetCap === null : true,
  );
  const [budgetCap, setBudgetCap] = useState(initialData?.budgetCap ?? 0);

  // Coupon
  const [couponCode, setCouponCode] = useState(initialData?.couponCode ?? "");

  // Batch
  const [batchCount, setBatchCount] = useState(100);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildPayload() {
    return {
      name,
      type,
      notes: notes || null,
      valueType,
      amount,
      cap: valueType === "percent_of_purchase" ? cap : null,
      startsAt: startsImmediately ? null : startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: noExpiry ? null : endsAt ? new Date(endsAt).toISOString() : null,
      firstPurchaseOnly,
      minPurchaseCents: minPurchaseCents || null,
      userSegment,
      totalUseLimit: unlimited ? null : totalUseLimit,
      perUserLimit,
      budgetCap: noBudgetCap ? null : budgetCap,
      couponCode: type === "coupon_fixed" ? couponCode.toUpperCase() : null,
      batchCount: type === "coupon_unique" ? batchCount : undefined,
    };
  }

  async function handleSave(activate: boolean) {
    if (type === "coupon_fixed" && !couponCode.trim()) {
      setError("Coupon code is required for fixed coupon promotions");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && initialData) {
        await client.promotions.update.mutate({
          id: initialData.id,
          ...buildPayload(),
        });
        if (activate) {
          await client.promotions.activate.mutate({ id: initialData.id });
        }
      } else {
        const created = await client.promotions.create.mutate(buildPayload());
        if (activate) {
          await client.promotions.activate.mutate({ id: created.id });
        }
      }
      router.push("/admin/promotions");
    } catch (err) {
      setError(toUserMessage(err, "Failed to save promotion"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Basic */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Basic</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="promo-name">Name</Label>
            <Input
              id="promo-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summer 2026 Launch Bonus"
            />
          </div>
          <div>
            <Label htmlFor="promo-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as PromotionType)}>
              <SelectTrigger id="promo-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bonus_on_purchase">Bonus on Purchase</SelectItem>
                <SelectItem value="coupon_fixed">Coupon (Fixed Code)</SelectItem>
                <SelectItem value="coupon_unique">Coupon (Unique Codes)</SelectItem>
                <SelectItem value="batch_grant">Batch Grant</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="promo-notes">Notes</Label>
            <Textarea
              id="promo-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this promotion..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Value */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Value</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={valueType}
            onValueChange={(v) => setValueType(v as ValueType)}
            className="flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="flat_credits" id="vt-flat" />
              <Label htmlFor="vt-flat" className="text-sm cursor-pointer">
                Flat credits
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="percent_of_purchase" id="vt-pct" />
              <Label htmlFor="vt-pct" className="text-sm cursor-pointer">
                Percent of purchase
              </Label>
            </div>
          </RadioGroup>
          <div>
            <Label htmlFor="promo-amount">
              {valueType === "flat_credits" ? "Credits (cents)" : "Basis points (1000 = 10%)"}
            </Label>
            <Input
              id="promo-amount"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          {valueType === "percent_of_purchase" && (
            <div>
              <Label htmlFor="promo-cap">Cap (cents)</Label>
              <Input
                id="promo-cap"
                type="number"
                min={0}
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Timing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="starts-immediately"
              checked={startsImmediately}
              onCheckedChange={(v) => setStartsImmediately(v === true)}
            />
            <Label htmlFor="starts-immediately">Starts immediately</Label>
          </div>
          {!startsImmediately && (
            <div>
              <Label htmlFor="promo-starts">Start date</Label>
              <Input
                id="promo-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="no-expiry"
              checked={noExpiry}
              onCheckedChange={(v) => setNoExpiry(v === true)}
            />
            <Label htmlFor="no-expiry">No expiry</Label>
          </div>
          {!noExpiry && (
            <div>
              <Label htmlFor="promo-ends">End date</Label>
              <Input
                id="promo-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Eligibility */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Eligibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="first-purchase"
              checked={firstPurchaseOnly}
              onCheckedChange={(v) => setFirstPurchaseOnly(v === true)}
            />
            <Label htmlFor="first-purchase">First purchase only</Label>
          </div>
          <div>
            <Label htmlFor="min-purchase">Min purchase (cents)</Label>
            <Input
              id="min-purchase"
              type="number"
              min={0}
              value={minPurchaseCents}
              onChange={(e) => setMinPurchaseCents(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>User segment</Label>
            <RadioGroup
              value={userSegment}
              onValueChange={(v) => setUserSegment(v as UserSegment)}
              className="flex flex-wrap gap-3 mt-1.5"
            >
              {(
                [
                  ["all", "All users"],
                  ["new_users", "New users"],
                  ["existing_users", "Existing users"],
                  ["tenant_list", "Specific tenants"],
                ] as const
              ).map(([val, label]) => (
                <div key={val} className="flex items-center gap-2">
                  <RadioGroupItem value={val} id={`seg-${val}`} />
                  <Label htmlFor={`seg-${val}`} className="text-sm cursor-pointer">
                    {label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      {/* Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="unlimited"
              checked={unlimited}
              onCheckedChange={(v) => setUnlimited(v === true)}
            />
            <Label htmlFor="unlimited">Unlimited uses</Label>
          </div>
          {!unlimited && (
            <div>
              <Label htmlFor="total-use-limit">Total use limit</Label>
              <Input
                id="total-use-limit"
                type="number"
                min={1}
                value={totalUseLimit}
                onChange={(e) => setTotalUseLimit(Number(e.target.value))}
              />
            </div>
          )}
          <div>
            <Label htmlFor="per-user-limit">Per-user limit</Label>
            <Input
              id="per-user-limit"
              type="number"
              min={1}
              value={perUserLimit}
              onChange={(e) => setPerUserLimit(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="no-budget-cap"
              checked={noBudgetCap}
              onCheckedChange={(v) => setNoBudgetCap(v === true)}
            />
            <Label htmlFor="no-budget-cap">No budget cap</Label>
          </div>
          {!noBudgetCap && (
            <div>
              <Label htmlFor="budget-cap">Budget cap (cents)</Label>
              <Input
                id="budget-cap"
                type="number"
                min={0}
                value={budgetCap}
                onChange={(e) => setBudgetCap(Number(e.target.value))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Coupon code (coupon_fixed only) */}
      {type === "coupon_fixed" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Coupon Code</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="coupon-code">Code</Label>
              <Input
                id="coupon-code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="SUMMER2026"
                className="font-mono uppercase"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Batch count (coupon_unique only) */}
      {type === "coupon_unique" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Batch Generation</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="batch-count">Codes to generate on creation</Label>
              <Input
                id="batch-count"
                type="number"
                min={1}
                max={10000}
                value={batchCount}
                onChange={(e) => setBatchCount(Number(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => handleSave(false)} disabled={saving || !name}>
          {saving ? "Saving..." : "Save as Draft"}
        </Button>
        <Button onClick={() => handleSave(true)} disabled={saving || !name}>
          {saving ? "Saving..." : "Activate"}
        </Button>
      </div>
    </div>
  );
}
