import { ChangesetDetailClient } from "./changeset-detail-client";

export default async function ChangesetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-6">
      <ChangesetDetailClient changesetId={id} />
    </div>
  );
}
