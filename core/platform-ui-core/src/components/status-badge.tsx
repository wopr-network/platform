import { Badge } from "@/components/ui/badge";
import type { InstanceStatus } from "@/lib/api";
import { INSTANCE_STATUS_STYLES } from "@/lib/status-colors";
import { cn } from "@/lib/utils";

const statusConfig: Record<InstanceStatus, { label: string; className: string }> = {
  running: { label: "Running", className: INSTANCE_STATUS_STYLES.running },
  stopped: { label: "Stopped", className: INSTANCE_STATUS_STYLES.stopped },
  degraded: { label: "Degraded", className: INSTANCE_STATUS_STYLES.degraded },
  error: { label: "Error", className: INSTANCE_STATUS_STYLES.error },
};

export function StatusBadge({ status }: { status: InstanceStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={cn("gap-1.5", config.className)}>
      <span
        className={cn("size-1.5 rounded-full", {
          "bg-emerald-500 animate-[pulse-dot_2s_ease-in-out_infinite]": status === "running",
          "bg-zinc-400": status === "stopped",
          "bg-yellow-500": status === "degraded",
          "bg-red-500 animate-[pulse-dot_0.8s_ease-in-out_infinite]": status === "error",
        })}
      />
      {config.label}
    </Badge>
  );
}
