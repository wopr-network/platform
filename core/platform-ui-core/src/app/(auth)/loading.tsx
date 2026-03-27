import { Skeleton } from "@/components/ui/skeleton";

export default function AuthLoading() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-6 space-y-6">
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-7 w-24" />
          <Skeleton className="mx-auto h-4 w-48" />
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="mx-auto h-4 w-40" />
      </div>
    </div>
  );
}
