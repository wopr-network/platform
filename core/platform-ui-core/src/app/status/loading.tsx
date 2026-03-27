import { Skeleton } from "@/components/ui/skeleton";

export default function StatusLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="rounded-sm border p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 5 }, (_, n) => `sk-${n}`).map((skId) => (
          <div key={skId} className="flex items-center justify-between py-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
