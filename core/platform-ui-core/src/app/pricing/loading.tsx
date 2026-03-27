import { Skeleton } from "@/components/ui/skeleton";

export default function PricingLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, n) => `sk-${n}`).map((skId) => (
          <div key={skId} className="rounded-sm border p-6 space-y-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 4 }, (_, n) => `feat-${n}`).map((featId) => (
              <Skeleton key={featId} className="h-3 w-full" />
            ))}
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
