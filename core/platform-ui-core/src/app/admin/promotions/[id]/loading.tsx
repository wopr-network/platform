import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPromotionDetailLoading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => `stat-sk-${i}`).map((skId) => (
          <Skeleton key={skId} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-48" />
    </div>
  );
}
