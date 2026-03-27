import { Skeleton } from "@/components/ui/skeleton";

export default function ChangesetDetailLoading() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-9 w-64" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, n) => `sk-${n}`).map((skId) => (
          <Skeleton key={skId} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
