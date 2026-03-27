import { Skeleton } from "@/components/ui/skeleton";

export default function AdminBillingHealthLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => `card-sk-${i}`).map((skId) => (
          <Skeleton key={skId} className="h-32" />
        ))}
      </div>
    </div>
  );
}
