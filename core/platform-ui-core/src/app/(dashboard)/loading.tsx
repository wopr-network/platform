import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, n) => `sk-${n}`).map((skId, _i) => (
          <div key={skId} className="rounded-sm border p-4 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-sm border p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 5 }, (_, n) => `sk-${n}`).map((skId) => (
          <Skeleton key={skId} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
