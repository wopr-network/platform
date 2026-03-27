import type { Metadata } from "next";
import Link from "next/link";
import { LandingNav } from "@/components/landing/landing-nav";
import { getBrandConfig } from "@/lib/brand-config";

const brand = getBrandConfig();

export const metadata: Metadata = {
  title: `Terms of Service — ${brand.productName}`,
  description: `Terms of Service for ${brand.productName}`,
};

export default function TermsPage() {
  return (
    <>
      <LandingNav />
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: February 2026</p>

        <nav className="mt-6 rounded-sm border border-border bg-card p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Contents
          </p>
          <ol className="list-none space-y-1.5 text-sm text-muted-foreground">
            <li>
              <a href="#section-1" className="underline underline-offset-4 hover:text-foreground">
                1. Acceptance of Terms
              </a>
            </li>
            <li>
              <a href="#section-2" className="underline underline-offset-4 hover:text-foreground">
                2. Description of Service
              </a>
            </li>
            <li>
              <a href="#section-3" className="underline underline-offset-4 hover:text-foreground">
                3. Account Terms
              </a>
            </li>
            <li>
              <a href="#section-4" className="underline underline-offset-4 hover:text-foreground">
                4. Payment, Refunds, and Plan Changes
              </a>
            </li>
            <li>
              <a href="#section-5" className="underline underline-offset-4 hover:text-foreground">
                5. Cancellation and Termination
              </a>
            </li>
            <li>
              <a href="#section-6" className="underline underline-offset-4 hover:text-foreground">
                6. Modifications to the Service
              </a>
            </li>
            <li>
              <a href="#section-7" className="underline underline-offset-4 hover:text-foreground">
                7. Uptime, Security, and Privacy
              </a>
            </li>
            <li>
              <a href="#section-8" className="underline underline-offset-4 hover:text-foreground">
                8. Copyright and Content Ownership
              </a>
            </li>
            <li>
              <a href="#section-9" className="underline underline-offset-4 hover:text-foreground">
                9. API Keys and Third-Party Services
              </a>
            </li>
            <li>
              <a href="#section-10" className="underline underline-offset-4 hover:text-foreground">
                10. Acceptable Use
              </a>
            </li>
            <li>
              <a href="#section-11" className="underline underline-offset-4 hover:text-foreground">
                11. Liability
              </a>
            </li>
            <li>
              <a href="#section-12" className="underline underline-offset-4 hover:text-foreground">
                12. Indemnification
              </a>
            </li>
            <li>
              <a href="#section-13" className="underline underline-offset-4 hover:text-foreground">
                13. Governing Law
              </a>
            </li>
            <li>
              <a href="#section-14" className="underline underline-offset-4 hover:text-foreground">
                14. Severability
              </a>
            </li>
            <li>
              <a href="#section-15" className="underline underline-offset-4 hover:text-foreground">
                15. Changes to Terms
              </a>
            </li>
            <li>
              <a href="#section-16" className="underline underline-offset-4 hover:text-foreground">
                16. Contact
              </a>
            </li>
          </ol>
        </nav>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section id="section-1" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using {brand.productName} at {brand.domain}, you agree to be
              bound by these Terms of Service and our{" "}
              <Link href="/privacy" className="text-foreground underline underline-offset-4">
                Privacy Policy
              </Link>
              . If you do not agree to these terms, do not use the service.
            </p>
          </section>

          <section id="section-2" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              2. Description of Service
            </h2>
            <p>
              {brand.productName} provides AI bot orchestration services. You bring your own API
              keys for AI providers (the &ldquo;bring your own key&rdquo; model).{" "}
              {brand.productName} manages orchestration, memory, plugins, and channel integrations.
              The service is available at
              {brand.domain}.
            </p>
            <p className="mt-2">
              {brand.productName} does not provide AI models directly. We orchestrate your
              interactions with your chosen AI providers using your API keys. Additionally, we offer
              optional hosted capabilities (such as voice synthesis and image generation) that
              consume credits on a per-use basis.
            </p>
          </section>

          <section id="section-3" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">3. Account Terms</h2>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>You must be at least 13 years of age to use this service.</li>
              <li>
                You must provide accurate and complete information when creating your account.
              </li>
              <li>
                You are responsible for maintaining the security of your account and password.{" "}
                {brand.productName} will not be liable for any loss or damage from your failure to
                maintain account security.
              </li>
              <li>
                You are responsible for all activity that occurs under your account, including
                actions taken by bots you configure.
              </li>
              <li>
                One person per account. Accounts are not to be shared between multiple individuals.
              </li>
              <li>
                Accounts must be registered by a human. Automated account creation is not permitted.
              </li>
            </ul>
          </section>

          <section id="section-4" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              4. Payment, Refunds, and Plan Changes
            </h2>
            <p>
              Paid plans are billed monthly via Stripe. AI provider costs are billed separately by
              your chosen provider and are not included in {brand.productName} charges.
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>
                Hosted capability credits are consumed on a per-use basis and are non-refundable
                once consumed.
              </li>
              <li>
                Upgrades and downgrades take effect immediately. When upgrading, you will be charged
                a prorated amount for the remainder of the billing period.
              </li>
              <li>
                Upon cancellation, you retain access through the end of your current billing period.
                No prorated refunds are issued for partial months.
              </li>
              <li>
                We reserve the right to change pricing with 30 days&apos; advance notice. Price
                changes do not apply retroactively.
              </li>
            </ul>
          </section>

          <section id="section-5" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              5. Cancellation and Termination
            </h2>
            <p>
              You may cancel your account at any time from your account settings. Upon cancellation:
            </p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>Your account data will be retained for 30 days, then permanently deleted.</li>
              <li>
                You may request immediate deletion by contacting{" "}
                <a
                  href={`mailto:${brand.emails.legal}`}
                  className="text-foreground underline underline-offset-4"
                >
                  {brand.emails.legal}
                </a>
                .
              </li>
              <li>
                Deleted data cannot be recovered. Export your data before canceling if you need it.
              </li>
            </ul>
            <p className="mt-2">
              We may suspend or terminate your account for violations of these terms. Where
              possible, we will provide notice before suspension. For serious violations (abuse,
              fraud, illegal activity), we reserve the right to terminate immediately without
              notice.
            </p>
          </section>

          <section id="section-6" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              6. Modifications to the Service
            </h2>
            <p>
              We reserve the right to modify, suspend, or discontinue any part of the service at any
              time. For material changes that significantly affect your use of the service, we will
              provide 30 days&apos; advance notice via email or through the platform. We will not be
              liable to you or any third party for any modification, suspension, or discontinuation.
            </p>
          </section>

          <section id="section-7" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              7. Uptime, Security, and Privacy
            </h2>
            <p>
              We make best-effort commitments to maintain service availability but do not guarantee
              specific uptime percentages for free or standard-tier plans. Our handling of your
              personal data is governed by our{" "}
              <Link href="/privacy" className="text-foreground underline underline-offset-4">
                Privacy Policy
              </Link>
              . We take security seriously and implement reasonable safeguards, but no service can
              guarantee absolute security.
            </p>
          </section>

          <section id="section-8" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              8. Copyright and Content Ownership
            </h2>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>
                You retain ownership of your content, including bot configurations, prompts, and
                data you provide to the service.
              </li>
              <li>
                You grant {brand.productName} a limited, non-exclusive license to process your
                content solely for the purpose of providing the service.
              </li>
              <li>
                {brand.companyLegalName} retains ownership of the platform, its code, documentation,
                and all related intellectual property.
              </li>
              <li>
                AI-generated outputs belong to you, subject to the terms of service of your chosen
                AI provider. {brand.productName} makes no claims to AI-generated content.
              </li>
            </ul>
          </section>

          <section id="section-9" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              9. API Keys and Third-Party Services
            </h2>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>
                You are solely responsible for your API keys and all usage charges incurred through
                them.
              </li>
              <li>
                {brand.productName} is not liable for charges from your AI providers, including
                charges resulting from bot activity you have configured.
              </li>
              <li>
                You must comply with the terms of service of any AI provider whose API keys you use
                with {brand.productName}.
              </li>
              <li>
                If an AI provider revokes or restricts your API key, the corresponding functionality
                in {brand.productName} will be unavailable. This is not a service failure on our
                part.
              </li>
            </ul>
          </section>

          <section id="section-10" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">10. Acceptable Use</h2>
            <p>You agree not to use {brand.productName} to:</p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li>Engage in any illegal activity or violate applicable laws and regulations</li>
              <li>
                Generate, distribute, or facilitate harassment, abuse, threats, or harmful content
              </li>
              <li>
                Attempt to disrupt the service, degrade performance for other users, or compromise
                system integrity
              </li>
              <li>
                Reverse engineer, decompile, or attempt to extract the source code of the platform
              </li>
              <li>Circumvent rate limits, usage restrictions, or other technical safeguards</li>
              <li>Impersonate other individuals or entities through your bots</li>
            </ul>
            <p className="mt-2">
              We reserve the right to remove content and suspend or terminate accounts that violate
              this policy. Repeated or serious violations may result in permanent bans.
            </p>
          </section>

          <section id="section-11" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">11. Liability</h2>
            <p>
              The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
              warranties of any kind, whether express or implied, including but not limited to
              implied warranties of merchantability, fitness for a particular purpose, and
              non-infringement.
            </p>
            <p className="mt-2">
              To the maximum extent permitted by law, {brand.companyLegalName} shall not be liable
              for any indirect, incidental, special, consequential, or punitive damages, or any loss
              of profits or revenues, whether incurred directly or indirectly, arising from your use
              of the service.
            </p>
            <p className="mt-2">
              Our total liability for any claim arising from or related to these terms or the
              service shall not exceed the amount you paid to {brand.productName} in the 12 months
              preceding the claim. We are not liable for actions taken by AI providers or for
              AI-generated content.
            </p>
          </section>

          <section id="section-12" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">12. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless {brand.companyLegalName}, its
              officers, directors, employees, and agents from and against any claims, liabilities,
              damages, losses, and expenses (including reasonable attorneys&apos; fees) arising out
              of or in any way connected with your use of the service, your content, or your
              violation of these terms.
            </p>
          </section>

          <section id="section-13" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">13. Governing Law</h2>
            <p>
              These terms shall be governed by and construed in accordance with the laws of the
              State of Delaware, United States, without regard to its conflict of law provisions.
              Any disputes arising under these terms shall be resolved in the state or federal
              courts located in Delaware.
            </p>
          </section>

          <section id="section-14" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">14. Severability</h2>
            <p>
              If any provision of these terms is found to be unenforceable or invalid by a court of
              competent jurisdiction, that provision will be limited or eliminated to the minimum
              extent necessary so that these terms shall otherwise remain in full force and effect.
            </p>
          </section>

          <section id="section-15" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">15. Changes to Terms</h2>
            <p>
              We may update these Terms of Service from time to time. If we make material changes,
              we will notify you at least 30 days in advance via email or through a prominent notice
              on the service. Your continued use of {brand.productName} after the updated terms take
              effect constitutes acceptance of the new terms.
            </p>
          </section>

          <section id="section-16" className="scroll-mt-16">
            <h2 className="mb-2 text-base font-semibold text-foreground">16. Contact</h2>
            <p>
              Questions about these terms? Email us at{" "}
              <a
                href={`mailto:${brand.emails.legal}`}
                className="text-foreground underline underline-offset-4"
              >
                {brand.emails.legal}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
          <Link href="/" className="underline underline-offset-4 hover:text-foreground">
            Home
          </Link>
        </div>
      </div>
    </>
  );
}
