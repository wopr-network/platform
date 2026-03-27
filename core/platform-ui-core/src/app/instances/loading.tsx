import { Skeleton } from "@/components/ui/skeleton";

export default function InstancesLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-[240px]" />
        <Skeleton className="h-9 w-[160px]" />
      </div>
      <div className="rounded-md border">
        <div className="space-y-0">
          {Array.from({ length: 5 }, (_, n) => `sk-${n}`).map((skId) => (
            <div key={skId} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
