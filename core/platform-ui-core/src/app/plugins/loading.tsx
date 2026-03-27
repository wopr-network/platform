import { Skeleton } from "@/components/ui/skeleton";

export default function PluginsLoading() {
  return (
    <div className="p-8">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="mb-6 h-9 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, n) => `sk-${n}`).map((skId) => (
          <div key={skId} className="rounded-sm border p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
