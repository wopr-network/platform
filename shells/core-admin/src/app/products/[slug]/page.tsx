export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Product: {slug}</h1>
      <p className="text-sm text-neutral-500">Edit product configuration.</p>
      {/* TODO: product config editor wired to tRPC */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-600">
        Product config editor will be wired to core server tRPC
      </div>
    </div>
  );
}
