export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tenant: {id}</h1>
      <p className="text-sm text-neutral-500">Billing, instances, and usage for this tenant.</p>
      {/* TODO: tenant detail panels wired to tRPC */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-600">
        Tenant detail will be wired to core server tRPC
      </div>
    </div>
  );
}
