import Link from "next/link";

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-zinc-500">Last updated: March 2026</p>
        </div>

        <div className="space-y-6 text-zinc-400 leading-relaxed">
          <p>
            By using Paperclip (&ldquo;the Service&rdquo;), you agree to these terms. The Service is operated by
            Paperclip and available at runpaperclip.com.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Account &amp; Access
          </h2>
          <p>
            You must provide accurate information when creating an account. You are responsible for maintaining the
            security of your credentials. One person or entity per account. Automated signups are prohibited.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Billing &amp; Credits
          </h2>
          <p>
            New accounts receive $5 in free credits. After that, usage is billed based on AI model consumption. Credits
            are non-refundable. Instances are suspended when credits reach zero and data is deleted after 30 days of
            suspension.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Acceptable Use
          </h2>
          <p>
            You may not use the Service for illegal activity, spam, harassment, or to harm others. We reserve the right
            to suspend accounts that violate these terms without notice.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Limitation of Liability
          </h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranty. We are not liable for any damages arising from
            your use of the Service, including data loss, agent behavior, or service interruptions.
          </p>

          <h2
            className="text-xl font-semibold text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            Contact
          </h2>
          <p>
            Questions? Email{" "}
            <a href="mailto:support@runpaperclip.com" className="text-indigo-400 no-underline hover:text-indigo-300">
              support@runpaperclip.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
