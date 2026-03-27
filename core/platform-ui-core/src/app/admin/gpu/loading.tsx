import { Skeleton } from "@/components/ui/skeleton";

export default function AdminGpuLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, n) => `kpi-${n}`).map((id) => (
          <Skeleton key={id} className="h-24 rounded-sm" />
        ))}
      </div>
      <div className="rounded-sm border">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="space-y-0">
          {Array.from({ length: 5 }, (_, n) => `row-${n}`).map((id) => (
            <div key={id} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
