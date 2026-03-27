"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PromotionForm } from "@/components/admin/promotions/promotion-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { Promotion } from "@/lib/promotions-types";
import { trpcVanilla } from "@/lib/trpc";

const client = trpcVanilla;

export default function EditPromotionPage() {
  const { id } = useParams<{ id: string }>();
  const [promo, setPromo] = useState<Promotion | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.promotions.get.query({ id });
      setPromo(result);
    } catch {
      // keep null
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  if (!promo) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Promotion not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Edit: {promo.name}</h1>
      <PromotionForm initialData={promo} />
    </div>
  );
}
