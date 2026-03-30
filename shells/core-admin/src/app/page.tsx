export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tenants" value="--" />
        <StatCard label="Active Instances" value="--" />
        <StatCard label="Credit Balance" value="--" />
        <StatCard label="Products" value="4" />
      </div>

      {/* Product breakdown */}
      <section>
        <h2 className="text-lg font-medium mb-3 text-neutral-300">Products</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ProductCard name="WOPR" tenants="--" instances="--" />
          <ProductCard name="Holy Ship" tenants="--" instances="--" />
          <ProductCard name="Paperclip" tenants="--" instances="--" />
          <ProductCard name="NemoClaw" tenants="--" instances="--" />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function ProductCard({ name, tenants, instances }: { name: string; tenants: string; instances: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="text-sm font-medium text-blue-400">{name}</div>
      <div className="mt-2 flex gap-4 text-xs text-neutral-500">
        <span>Tenants: {tenants}</span>
        <span>Instances: {instances}</span>
      </div>
    </div>
  );
}
