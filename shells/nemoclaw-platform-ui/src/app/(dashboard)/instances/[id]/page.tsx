import { NemoClawInstanceDetail } from "./nemoclaw-instance-detail";

export default async function InstanceDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return (
		<div className="p-6">
			<NemoClawInstanceDetail instanceId={id} />
		</div>
	);
}
