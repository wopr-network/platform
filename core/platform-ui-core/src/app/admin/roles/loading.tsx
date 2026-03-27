import { Skeleton } from "@/components/ui/skeleton";

export default function AdminRolesLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-8 flex-1 max-w-sm rounded-md" />
        <Skeleton className="h-8 w-44 rounded-md" />
      </div>
      <div className="rounded-md border">
        {Array.from({ length: 8 }, (_, i) => `sk-row-${i}`).map((k) => (
          <div key={k} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
