/** Shared types for the promotions system UI. */

export type PromotionStatus = "draft" | "scheduled" | "active" | "paused" | "expired" | "cancelled";

export type PromotionType = "bonus_on_purchase" | "coupon_fixed" | "coupon_unique" | "batch_grant";

export type ValueType = "flat_credits" | "percent_of_purchase";

export type UserSegment = "all" | "new_users" | "existing_users" | "tenant_list";

export interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  status: PromotionStatus;
  valueType: ValueType;
  amount: number;
  cap: number | null;
  startsAt: string | null;
  endsAt: string | null;
  firstPurchaseOnly: boolean;
  minPurchaseCents: number | null;
  userSegment: UserSegment;
  totalUseLimit: number | null;
  perUserLimit: number;
  budgetCap: number | null;
  totalUses: number;
  totalCreditsGranted: number;
  couponCode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Redemption {
  id: string;
  promotionId: string;
  tenantId: string;
  creditsGranted: number;
  purchaseAmountCents: number | null;
  couponCode: string | null;
  createdAt: string;
}

export type RateOverrideStatus = "active" | "scheduled" | "expired" | "cancelled";

export interface AdapterRateOverride {
  id: string;
  adapterId: string;
  name: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string | null;
  status: RateOverrideStatus;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}
