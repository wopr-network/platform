import { InstanceDetailClient } from "@core/app/instances/[id]/instance-detail-client";

export default async function InstanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-6">
      <InstanceDetailClient instanceId={id} />
    </div>
  );
}
