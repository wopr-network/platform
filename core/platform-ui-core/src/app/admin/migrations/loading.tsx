import { Skeleton } from "@/components/ui/skeleton";

export default function AdminMigrationsLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="rounded-md border">
        {Array.from({ length: 6 }, (_, i) => `sk-row-${i}`).map((k) => (
          <div key={k} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
