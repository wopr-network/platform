import { Settings2 } from "lucide-react";
import { UpdateSettingsCard } from "@/components/fleet/update-settings-card";

export default function FleetSettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-muted-foreground" />
          Fleet Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure update behavior and maintenance windows for your fleet.
        </p>
      </div>
      <UpdateSettingsCard />
    </div>
  );
}
