import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh px-6 py-24 text-white" style={{ background: "#09090b" }}>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/" className="text-sm text-indigo-400 no-underline hover:text-indigo-300">
            &larr; Back
          </Link>
          <h1
            className="mt-4 text-3xl font-bold tracking-tight"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-zinc-500">Last updated: March 2026</p>
        </div>

        <div className="space-y-6 text-zinc-400 leading-relaxed">
          <p>
            Paperclip (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) operates the runpaperclip.com platform.
            This policy describes how we collect, use, and protect your information.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Information We Collect
          </h2>
          <p>
            We collect information you provide directly: your name, email address, and payment information when you
            create an account. We also collect usage data including API calls, agent activity logs, and performance
            metrics to operate and improve the service.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            How We Use Your Information
          </h2>
          <p>
            We use your information to provide and maintain the service, process payments, send transactional emails
            (verification, billing alerts, team invites), and improve our platform. We do not sell your personal data.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Data Security
          </h2>
          <p>
            We use industry-standard encryption for data in transit (TLS) and at rest. Agent instances run in isolated
            containers with per-instance databases. Payment processing is handled by Stripe and never touches our
            servers.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Contact
          </h2>
          <p>
            Questions about this policy? Email{" "}
            <a href="mailto:support@runpaperclip.com" className="text-indigo-400 no-underline hover:text-indigo-300">
              support@runpaperclip.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
