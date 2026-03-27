import { PaperclipInstanceDetail } from "./paperclip-instance-detail";

export default async function InstanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-6">
      <PaperclipInstanceDetail instanceId={id} />
    </div>
  );
}
