import { BillingHealthDashboard } from "@/components/admin/billing-health-dashboard";

export default function BillingHealthPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Billing Health</h1>
      <BillingHealthDashboard />
    </div>
  );
}
