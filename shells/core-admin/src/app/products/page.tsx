export default function ProductsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Products</h1>
      <p className="text-sm text-neutral-500">Product configuration management.</p>
      {/* TODO: product cards linking to /products/[slug] */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {["wopr", "holyship", "paperclip", "nemoclaw"].map((slug) => (
          <a
            key={slug}
            href={`/products/${slug}`}
            className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 hover:border-blue-500/50 transition-colors"
          >
            <div className="text-sm font-medium text-blue-400">{slug}</div>
            <div className="text-xs text-neutral-500 mt-1">View and edit product configuration</div>
          </a>
        ))}
      </div>
    </div>
  );
}
