import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPromotionsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => `sk-${i}`).map((skId) => (
          <Skeleton key={skId} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
