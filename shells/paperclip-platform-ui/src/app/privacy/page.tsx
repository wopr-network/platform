import Link from "next/link";

const h2 = "text-xl font-semibold text-white";
const style = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };
const snark = "mt-3 text-sm italic text-zinc-600 border-l-2 border-zinc-800 pl-3";

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh px-6 py-24 text-white" style={{ background: "#09090b" }}>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/" className="text-sm text-indigo-400 no-underline hover:text-indigo-300">
            &larr; Back
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight" style={style}>
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-zinc-500">Last updated: April 2026</p>
        </div>

        <div className="space-y-6 text-zinc-400 leading-relaxed">
          <p>
            Paperclip (&ldquo;we,&rdquo; &ldquo;our,&rdquo; &ldquo;us&rdquo;) operates the runpaperclip.com platform.
            This policy describes what we collect, why, and what we do with it.
          </p>
          <p className={snark}>Here&apos;s what we know about you and why. No surprises.</p>

          <h2 className={h2} style={style}>
            1. Information We Collect
          </h2>
          <p>
            <strong className="text-white">Account information:</strong> name, email address, and OAuth profile data
            (e.g., GitHub avatar) when you create an account.
          </p>
          <p>
            <strong className="text-white">Payment information:</strong> processed entirely by Stripe. We never see,
            store, or touch your card number. We receive transaction confirmations and billing metadata only.
          </p>
          <p>
            <strong className="text-white">Usage data:</strong> API calls, agent activity logs, model consumption,
            performance metrics, and operational telemetry. This is how we bill you and keep things running.
          </p>
          <p>
            <strong className="text-white">Agent content:</strong> prompts you send, agent outputs, code generated,
            issues filed, and documents created through the Service. This content is stored in your isolated instance.
          </p>
          <p className={snark}>
            Your name, your email, what your robots did, and how much it cost. That&apos;s it. We don&apos;t want your
            browsing history or your diary.
          </p>

          <h2 className={h2} style={style}>
            2. How We Use Your Information
          </h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide, operate, and maintain the Service</li>
            <li>Process payments and send billing alerts</li>
            <li>Send transactional emails (verification, welcome, low balance, suspension notices)</li>
            <li>Debug issues and improve platform reliability</li>
            <li>Detect and prevent abuse, fraud, and unauthorized access</li>
          </ul>
          <p>
            <strong className="text-white">We do not sell your personal data. Ever.</strong> We do not use your agent
            content to train AI models. We do not share your data with advertisers.
          </p>
          <p className={snark}>
            We use your data to run the thing you&apos;re paying us to run. We don&apos;t sell it. We don&apos;t snoop.
            We&apos;re busy enough.
          </p>

          <h2 className={h2} style={style}>
            3. Data Storage &amp; Isolation
          </h2>
          <p>
            Each user&apos;s agent instance runs in an isolated Docker container with its own database. Your agent data
            is not shared with or accessible to other users. Platform-level data (account, billing, authentication) is
            stored in a shared database with standard access controls.
          </p>
          <p className={snark}>Your robots live in their own box. Nobody else can see inside it.</p>

          <h2 className={h2} style={style}>
            4. Data Security
          </h2>
          <p>
            All data in transit is encrypted via TLS. Secrets are stored in HashiCorp Vault, not environment variables.
            Payment processing is handled entirely by Stripe under PCI DSS compliance. We use OAuth for authentication
            (GitHub, Google) — we never store your passwords in plaintext.
          </p>
          <p className={snark}>
            TLS everywhere, secrets in a vault, payments via Stripe. We take this part seriously even if our ToS has
            zombie pirates in it.
          </p>

          <h2 className={h2} style={style}>
            5. Data Retention
          </h2>
          <p>
            Your account data is retained as long as your account is active. Agent instance data is deleted within 30
            days of instance suspension or account deletion. Billing records and audit logs may be retained for up to 7
            years for legal and tax compliance. You may delete your account at any time through the Settings page.
          </p>
          <p className={snark}>
            Delete your account and your data goes with it. We keep tax receipts because we have to.
          </p>

          <h2 className={h2} style={style}>
            6. Third-Party Services
          </h2>
          <p>We use the following third-party services that may process your data:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong className="text-white">Stripe</strong> — payment processing
            </li>
            <li>
              <strong className="text-white">Resend</strong> — transactional email delivery
            </li>
            <li>
              <strong className="text-white">OpenRouter</strong> — AI model inference (your prompts are sent to upstream
              model providers)
            </li>
            <li>
              <strong className="text-white">GitHub / Google</strong> — OAuth authentication
            </li>
            <li>
              <strong className="text-white">Cloudflare</strong> — DNS, CDN, and DDoS protection
            </li>
          </ul>
          <p>Each service operates under its own privacy policy and data processing agreements.</p>
          <p className={snark}>
            These companies touch your data in specific ways. We picked them on purpose. Read their policies if
            you&apos;re curious.
          </p>

          <h2 className={h2} style={style}>
            7. Cookies
          </h2>
          <p>
            We use essential cookies for authentication session management. We do not use tracking cookies, analytics
            cookies, or advertising cookies. There is no cookie banner because there is nothing to consent to beyond
            &ldquo;this website remembers that you logged in.&rdquo;
          </p>
          <p className={snark}>
            One cookie. It remembers you&apos;re logged in. That&apos;s it. No banner. You&apos;re welcome.
          </p>

          <h2 className={h2} style={style}>
            8. Your Rights
          </h2>
          <p>
            You may request access to, correction of, or deletion of your personal data at any time by emailing{" "}
            <a href="mailto:privacy@runpaperclip.com" className="text-indigo-400 no-underline hover:text-indigo-300">
              privacy@runpaperclip.com
            </a>{" "}
            or by deleting your account through the Settings page. If you are in the EU, UK, or California, you have
            additional rights under GDPR, UK GDPR, or CCPA respectively. We will comply with valid requests within 30
            days.
          </p>
          <p className={snark}>
            Want your data? Ask. Want it deleted? Hit the button. Want to exercise your GDPR rights? We&apos;ll handle
            it.
          </p>

          <h2 className={h2} style={style}>
            9. Children
          </h2>
          <p>
            The Service is not intended for anyone under 18. We do not knowingly collect data from minors. If we learn
            that we have, we will delete it immediately.
          </p>
          <p className={snark}>You must be this tall to ride.</p>

          <h2 className={h2} style={style}>
            10. Changes to This Policy
          </h2>
          <p>
            We may update this policy at any time by posting the revised version on this page. Your continued use of the
            Service after changes are posted constitutes acceptance.
          </p>
          <p className={snark}>Same deal as the ToS. We change it, you keep using it, that&apos;s agreement.</p>

          <h2 className={h2} style={style}>
            11. Contact
          </h2>
          <p>
            Questions about this policy? Email{" "}
            <a href="mailto:privacy@runpaperclip.com" className="text-indigo-400 no-underline hover:text-indigo-300">
              privacy@runpaperclip.com
            </a>
          </p>
          <p className={snark}>We read this one faster than legal@. Probably.</p>
        </div>
      </div>
    </div>
  );
}
