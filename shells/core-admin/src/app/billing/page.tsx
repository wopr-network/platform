export default function BillingPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <p className="text-sm text-neutral-500">Cross-product billing overview.</p>
      {/* TODO: billing summary, revenue by product, credit balances */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-600">
        Billing overview will be wired to core server tRPC
      </div>
    </div>
  );
}
