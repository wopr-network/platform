"use client";

import { PromotionForm } from "@/components/admin/promotions/promotion-form";

export default function NewPromotionPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New Promotion</h1>
      <PromotionForm />
    </div>
  );
}
