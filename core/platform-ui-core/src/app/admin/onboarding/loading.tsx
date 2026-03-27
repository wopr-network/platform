import { Skeleton } from "@/components/ui/skeleton";

export default function AdminOnboardingLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => `sk-stat-${i}`).map((k) => (
          <Skeleton key={k} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}
