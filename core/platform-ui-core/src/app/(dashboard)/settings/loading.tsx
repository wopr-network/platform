import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="rounded-sm border p-6 space-y-4">
        <Skeleton className="h-5 w-28" />
        <div className="space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full max-w-md" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full max-w-md" />
          </div>
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="rounded-sm border p-6 space-y-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
}
