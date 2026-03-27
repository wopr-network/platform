import { Skeleton } from "@/components/ui/skeleton";

export default function FleetUpdatesLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {/* Rollout status card skeleton */}
      <div className="rounded-md border p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
      {/* Table skeleton */}
      <div className="rounded-md border">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="space-y-0">
          {Array.from({ length: 6 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
