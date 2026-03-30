export default function TenantsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tenants</h1>
      <p className="text-sm text-neutral-500">All tenants across all products. Filterable by product.</p>
      {/* TODO: tenant list table with product filter, wired to tRPC */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-600">
        Tenant list will be wired to core server tRPC
      </div>
    </div>
  );
}
