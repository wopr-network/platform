import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { getBrandConfig } from "@/lib/brand-config";

const brand = getBrandConfig();

export const metadata: Metadata = {
  title: `Privacy Policy — ${brand.productName}`,
  description: `Privacy Policy for ${brand.productName}`,
};

export default function PrivacyPage() {
  return (
    <>
      <LandingNav />
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: February 2026</p>

        <nav className="mt-6 rounded-sm border border-border bg-card p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Contents
          </p>
          <ol className="list-none space-y-1.5 text-sm text-muted-foreground">
            <li>
              <a href="#section-1" className="underline underline-offset-4 hover:text-foreground">
                1. Identity and Contact Details
              </a>
            </li>
            <li>
              <a href="#section-2" className="underline underline-offset-4 hover:text-foreground">
                2. What We Collect and Why
              </a>
            </li>
            <li>
              <a href="#section-3" className="underline underline-offset-4 hover:text-foreground">
                3. When We Access or Share Your Information
              </a>
            </li>
            <li>
              <a href="#section-4" className="underline underline-offset-4 hover:text-foreground">
                4. Your Rights Under GDPR
              </a>
            </li>
            <li>
              <a href="#section-5" className="underline underline-offset-4 hover:text-foreground">
                5. Your Rights Under CCPA
              </a>
            </li>
            <li>
              <a href="#section-6" className="underline underline-offset-4 hover:text-foreground">
                6. Data Retention
              </a>
            </li>
            <li>
              <a href="#section-7" className="underline underline-offset-4 hover:text-foreground">
                7. Cookies and Tracking
              </a>
            </li>
            <li>
              <a href="#section-8" className="underline underline-offset-4 hover:text-foreground">
                8. Security
              </a>
            </li>
            <li>
              <a href="#section-9" className="underline underline-offset-4 hover:text-foreground">
                9. International Data Transfers
              </a>
            </li>
            <li>
              <a href="#section-10" className="underline underline-offset-4 hover:text-foreground">
                10. Data Breach Notification
              </a>
            </li>
            <li>
              <a href="#section-11" className="underline underline-offset-4 hover:text-foreground">
                11. Children&apos;s Privacy
              </a>
            </li>
            <li>
              <a href="#section-12" className="underline underline-offset-4 hover:text-foreground">
                12. Changes to This Policy
              </a>
            </li>
            <li>
              <a href="#section-13" className="underline underline-offset-4 hover:text-foreground">
                13. Contact
              </a>
            </li>
          </ol>
        </nav>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section id="section-1" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              1. Identity and Contact Details
            </h2>
            <p>
              {brand.companyLegalName} (&ldquo;{brand.brandName},&rdquo; &ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is the data controller responsible for your
              personal data. We operate the {brand.productName} platform available at {brand.domain}
              .
            </p>
            <p className="mt-2">
              If you have questions about how we handle your data, or if you wish to exercise any of
              your rights described below, contact us at{" "}
              <a
                href={`mailto:${brand.emails.privacy}`}
                className="text-foreground underline underline-offset-4"
              >
                {brand.emails.privacy}
              </a>
              .
            </p>
          </section>

          <section id="section-2" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              2. What We Collect and Why
            </h2>
            <p>
              We only collect information that is necessary to provide and improve{" "}
              {brand.productName}
              services. We do not collect data for advertising or sell your information to third
              parties.
            </p>

            <h3 className="mb-1 mt-4 text-sm font-semibold text-foreground">Account information</h3>
            <p>
              Your name and email address, collected when you create an account. We use this to
              identify you, communicate with you about your account, and send transactional emails
              such as password resets and billing notifications. Legal basis: performance of our
              contract with you.
            </p>

            <h3 className="mb-1 mt-4 text-sm font-semibold text-foreground">Billing information</h3>
            <p>
              Payment card details are processed directly by Stripe and are never stored on{" "}
              {brand.brandName}
              servers. We receive only a tokenized reference, your billing email, and transaction
              history from Stripe. Legal basis: performance of our contract with you.
            </p>

            <h3 className="mb-1 mt-4 text-sm font-semibold text-foreground">API keys</h3>
            <p>
              You provide your own API keys for third-party AI providers (the &ldquo;bring your own
              key&rdquo; model). These keys are encrypted at rest and used only to make requests to
              your chosen providers on your behalf. We do not log or store the content of AI
              interactions. Legal basis: performance of our contract with you.
            </p>

            <h3 className="mb-1 mt-4 text-sm font-semibold text-foreground">Bot configuration</h3>
            <p>
              Plugin selections, channel configurations, provider settings, and other choices you
              make while setting up and operating your bots. This data is necessary to deliver the
              service as you have configured it. Legal basis: performance of our contract with you.
            </p>

            <h3 className="mb-1 mt-4 text-sm font-semibold text-foreground">Usage data</h3>
            <p>
              API call counts, feature usage metrics, and hosted capability credit consumption. We
              use this data for billing, capacity planning, and service improvement. Legal basis:
              legitimate interest in maintaining and improving our service.
            </p>

            <h3 className="mb-1 mt-4 text-sm font-semibold text-foreground">Technical data</h3>
            <p>
              IP address, browser type, and operating system collected via web server logs. We use
              this for security monitoring, abuse prevention, and debugging. Server logs are
              retained for 90 days. Legal basis: legitimate interest in securing our service.
            </p>
          </section>

          <section id="section-3" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              3. When We Access or Share Your Information
            </h2>
            <p>
              We do not sell your personal data. We do not use third-party tracking or advertising
              cookies. We share data with the following categories of sub-processors only as needed
              to provide the service:
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>
                <span className="text-foreground">Stripe</span> &mdash; payment processing. Stripe
                receives your billing information to process subscription payments. Stripe&apos;s
                privacy policy governs their handling of your payment data.
              </li>
              <li>
                <span className="text-foreground">AI providers</span> (user-selected,
                bring-your-own-key model) &mdash; request fulfillment. Your prompts and inputs are
                sent to the AI provider you have configured. We do not choose or control which
                provider you use.
              </li>
              <li>
                <span className="text-foreground">Hosting provider</span> &mdash; infrastructure.
                Our servers and Docker fleet are hosted by third-party infrastructure providers who
                may process data on our behalf under strict data processing agreements.
              </li>
              <li>
                <span className="text-foreground">Email service</span> &mdash; transactional emails.
                We use a third-party email service to send password resets, billing notifications,
                and other operational messages.
              </li>
            </ul>
            <p className="mt-2">
              We may also disclose information if required by law, to enforce our Terms of Service,
              or to protect the rights, property, or safety of {brand.companyLegalName}, our users,
              or the public.
            </p>
          </section>

          <section id="section-4" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              4. Your Rights Under GDPR
            </h2>
            <p>
              If you are located in the European Union or European Economic Area, you have the
              following rights under the General Data Protection Regulation:
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>Right of access (Art. 15) &mdash; request a copy of your personal data</li>
              <li>
                Right to rectification (Art. 16) &mdash; correct inaccurate or incomplete data
              </li>
              <li>
                Right to erasure (Art. 17) &mdash; request deletion of your personal data
                (&ldquo;right to be forgotten&rdquo;)
              </li>
              <li>
                Right to restrict processing (Art. 18) &mdash; limit how we use your data in certain
                circumstances
              </li>
              <li>
                Right to data portability (Art. 20) &mdash; receive your data in a structured,
                commonly used, machine-readable format
              </li>
              <li>
                Right to object (Art. 21) &mdash; object to processing based on legitimate interest
              </li>
              <li>Right to lodge a complaint with a supervisory authority in your member state</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, email{" "}
              <a
                href={`mailto:${brand.emails.privacy}`}
                className="text-foreground underline underline-offset-4"
              >
                {brand.emails.privacy}
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section id="section-5" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              5. Your Rights Under CCPA
            </h2>
            <p>
              If you are a California resident, the California Consumer Privacy Act provides you
              with the following rights:
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>Right to know what personal information is collected, used, shared, or sold</li>
              <li>Right to delete personal information held by us</li>
              <li>
                Right to opt-out of the sale of personal information (note: we do not sell personal
                information)
              </li>
              <li>Right to non-discrimination for exercising your privacy rights</li>
            </ul>
            <p className="mt-2">
              To exercise these rights, email{" "}
              <a
                href={`mailto:${brand.emails.privacy}`}
                className="text-foreground underline underline-offset-4"
              >
                {brand.emails.privacy}
              </a>
              .
            </p>
          </section>

          <section id="section-6" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">6. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. If you request
              deletion of your account, we will delete your personal data within 30 days. Some
              information may be retained longer where required by law:
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>
                Billing and transaction records are retained for up to 7 years as required by tax
                and financial regulations
              </li>
              <li>Server logs are retained for 90 days</li>
              <li>Backups containing your data are purged within 60 days of account deletion</li>
            </ul>
          </section>

          <section id="section-7" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              7. Cookies and Tracking
            </h2>
            <p>
              We use essential cookies only. These cookies are required for authentication and
              session management (powered by better-auth) and cannot be disabled without breaking
              the service. We do not use marketing cookies, analytics cookies, or third-party
              tracking pixels. There is no cookie banner because there is nothing optional to
              consent to.
            </p>
          </section>

          <section id="section-8" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">8. Security</h2>
            <p>
              We take reasonable measures to protect your personal data. API keys are encrypted at
              rest. All data in transit is protected via HTTPS. Access to production systems is
              restricted to authorized personnel. We conduct regular security reviews of our
              infrastructure and codebase. However, no method of transmission or storage is 100%
              secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section id="section-9" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              9. International Data Transfers
            </h2>
            <p>
              Your data may be processed in the United States or other countries where our
              infrastructure providers operate. If you are located in the EU/EEA, transfers of your
              personal data outside the EU/EEA are governed by Standard Contractual Clauses or
              equivalent safeguards as required by GDPR.
            </p>
          </section>

          <section id="section-10" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              10. Data Breach Notification
            </h2>
            <p>
              In the event of a data breach that is likely to result in a risk to your rights and
              freedoms, we will notify affected users without undue delay. Where required by GDPR,
              we will also notify the relevant supervisory authority within 72 hours of becoming
              aware of the breach.
            </p>
          </section>

          <section id="section-11" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              11. Children&apos;s Privacy
            </h2>
            <p>
              {brand.productName} is not intended for use by children under the age of 13. We do not
              knowingly collect personal data from children under 13. If you believe a child under
              13 has provided us with personal data, please contact us at{" "}
              <a
                href={`mailto:${brand.emails.privacy}`}
                className="text-foreground underline underline-offset-4"
              >
                {brand.emails.privacy}
              </a>{" "}
              and we will delete the data promptly.
            </p>
          </section>

          <section id="section-12" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              12. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. If we make material changes, we
              will notify you by email or through a prominent notice on the service before the
              changes take effect. Your continued use of {brand.productName} after the changes take
              effect constitutes acceptance of the updated policy.
            </p>
          </section>

          <section id="section-13" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">13. Contact</h2>
            <p>
              Questions about this privacy policy? Email us at{" "}
              <a
                href={`mailto:${brand.emails.privacy}`}
                className="text-foreground underline underline-offset-4"
              >
                {brand.emails.privacy}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms of Service
          </Link>
          <Link href="/" className="underline underline-offset-4 hover:text-foreground">
            Home
          </Link>
        </div>
      </div>
    </>
  );
}
