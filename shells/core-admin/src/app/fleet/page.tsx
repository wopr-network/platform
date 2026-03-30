export default function FleetPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Fleet</h1>
      <p className="text-sm text-neutral-500">All fleet instances across all products.</p>
      {/* TODO: instance grid with status, product, tenant columns */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-600">
        Fleet instances will be wired to core server tRPC
      </div>
    </div>
  );
}
