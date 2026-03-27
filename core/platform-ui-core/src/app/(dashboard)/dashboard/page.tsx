import { CommandCenter } from "@/components/dashboard/command-center";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";

export default function DashboardPage() {
  return (
    <>
      <div className="p-6 pb-0">
        <SetupChecklist />
      </div>
      <CommandCenter />
    </>
  );
}
