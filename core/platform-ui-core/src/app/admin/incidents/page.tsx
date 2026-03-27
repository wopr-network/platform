import { IncidentDashboard } from "@/components/admin/incident-dashboard";

export default function IncidentsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Incident Response</h1>
      <IncidentDashboard />
    </div>
  );
}
