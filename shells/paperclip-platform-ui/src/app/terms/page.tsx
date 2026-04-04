import Link from "next/link";

const h2 = "text-xl font-semibold text-white";
const style = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };

export default function TermsPage() {
  return (
    <div className="min-h-dvh px-6 py-24 text-white" style={{ background: "#09090b" }}>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/" className="text-sm text-indigo-400 no-underline hover:text-indigo-300">
            &larr; Back
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight" style={style}>
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-zinc-500">Last updated: April 2026</p>
        </div>

        <div className="space-y-6 text-zinc-400 leading-relaxed">
          <p>
            By accessing or using Paperclip (&ldquo;the Service&rdquo;), operated by WOPR Network Inc.
            (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) and available at runpaperclip.com, you agree to
            be bound by these Terms of Service. If you do not agree, do not use the Service.
          </p>

          <h2 className={h2} style={style}>
            1. Nature of the Service
          </h2>
          <p>
            Paperclip is an automation platform. We provide tools that deploy and orchestrate AI agents on your behalf.
            These agents write code, file issues, make decisions, and take actions based on instructions you provide.{" "}
            <strong className="text-white">
              The agents act on your direction. We do not control, review, or approve the output of any agent.
            </strong>{" "}
            You are the principal; the agents are your tools.
          </p>

          <h2 className={h2} style={style}>
            2. Account &amp; Access
          </h2>
          <p>
            You must provide accurate information when creating an account. You are responsible for maintaining the
            security of your credentials and for all activity under your account. One person or legal entity per
            account. Automated signups are prohibited. You must be at least 18 years old or the age of legal majority in
            your jurisdiction.
          </p>

          <h2 className={h2} style={style}>
            3. Billing &amp; Credits
          </h2>
          <p>
            New accounts receive a one-time grant of free credits. After that, usage is billed based on AI model
            consumption at rates displayed in the Service. Credits are non-refundable and non-transferable. Instances
            are suspended when credits reach zero. Data associated with suspended instances is permanently deleted after
            30 days. We may change pricing at any time with 30 days&apos; notice.
          </p>

          <h2 className={h2} style={style}>
            4. Your Responsibility for Agent Output
          </h2>
          <p>
            <strong className="text-white">
              You are solely and entirely responsible for all actions taken by AI agents deployed through your account.
            </strong>{" "}
            This includes, without limitation, code written, commits pushed, issues filed, messages sent, infrastructure
            provisioned, API calls made, data processed, and any business or operational decisions executed by agents
            acting on your instructions. You agree that agent output constitutes your own actions for all legal
            purposes.
          </p>
          <p>
            You acknowledge that AI agents may produce incorrect, incomplete, harmful, or unexpected results. It is your
            responsibility to review, test, and validate all agent output before relying on it in any production,
            business, financial, legal, or safety-critical context.
          </p>

          <h2 className={h2} style={style}>
            5. No Warranty
          </h2>
          <p>
            <strong className="text-white">
              THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTY OF ANY KIND,
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, ACCURACY, OR NON-INFRINGEMENT.
            </strong>{" "}
            We make no warranty of correctness, completeness, reliability, accuracy, timeliness, or fitness for any
            purpose. We do not warrant that agent output reflects reality, that agents will follow your instructions, or
            that results will be suitable for any particular use. AI systems are inherently probabilistic and may
            hallucinate, fabricate, contradict themselves, or produce results that are entirely disconnected from fact.
            You accept this risk entirely.
          </p>

          <h2 className={h2} style={style}>
            6. Limitation of Liability
          </h2>
          <p>
            <strong className="text-white">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS
              SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS
              OF PROFITS, REVENUE, DATA, BUSINESS OPPORTUNITIES, OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF THE
              SERVICE, REGARDLESS OF THE THEORY OF LIABILITY.
            </strong>
          </p>
          <p>
            Our total aggregate liability for any claims arising from your use of the Service shall not exceed the
            amount you paid to us in the twelve (12) months preceding the claim. This limitation applies whether the
            claim is based in contract, tort, strict liability, or any other legal theory.
          </p>
          <p>
            Without limiting the foregoing, we are not liable for: financial losses resulting from agent actions; damage
            to your reputation, business relationships, or market position; data loss, corruption, or unauthorized
            disclosure caused by agent behavior; costs of substitute services or remediation; or any damages arising
            from your reliance on agent output without independent verification.
          </p>

          <h2 className={h2} style={style}>
            7. Indemnification
          </h2>
          <p>
            You agree to indemnify, defend, and hold harmless the Company and its officers, directors, employees, and
            agents from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys&apos;
            fees) arising from: (a) your use of the Service; (b) actions taken by agents deployed through your account;
            (c) your violation of these Terms; or (d) your violation of any third-party rights.
          </p>

          <h2 className={h2} style={style}>
            8. Acceptable Use
          </h2>
          <p>
            You may not use the Service for illegal activity, spam, harassment, generating malware, unauthorized access
            to computer systems, circumventing security controls, or to harm others.{" "}
            <strong className="text-white">
              Any use of the Service for unauthorized access, hacking, exploitation, or attack against any system,
              network, or individual will result in immediate account termination and referral to law enforcement. We
              will cooperate fully with authorities and pursue prosecution to the fullest extent of the law.
            </strong>{" "}
            We reserve the right to suspend or terminate accounts that violate these terms without notice or refund.
          </p>

          <h2 className={h2} style={style}>
            9. Intellectual Property
          </h2>
          <p>
            You retain ownership of all content you create through the Service, including code, documents, and other
            output generated by agents acting on your instructions. We retain ownership of the Service, its
            infrastructure, and all underlying technology. You grant us a limited license to process your content solely
            to provide the Service.
          </p>

          <h2 className={h2} style={style}>
            10. Data &amp; Privacy
          </h2>
          <p>
            Your use of the Service is also governed by our{" "}
            <Link href="/privacy" className="text-indigo-400 no-underline hover:text-indigo-300">
              Privacy Policy
            </Link>
            . Agent activity, including prompts, outputs, and operational logs, may be retained for billing, debugging,
            and service improvement purposes. You are responsible for ensuring that any data you process through the
            Service complies with applicable laws, including data protection regulations.
          </p>

          <h2 className={h2} style={style}>
            11. Termination
          </h2>
          <p>
            Either party may terminate this agreement at any time. You may delete your account through the Service
            settings. We may suspend or terminate your access for any reason, including violation of these Terms, with
            or without notice. Upon termination, your right to use the Service ceases immediately. We may delete your
            data within 30 days of termination.
          </p>

          <h2 className={h2} style={style}>
            12. Governing Law &amp; Disputes
          </h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of
            law principles. Any disputes arising from these Terms or the Service shall be resolved through binding
            arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules. The
            arbitration shall take place in Delaware. You waive any right to participate in a class action.
          </p>

          <h2 className={h2} style={style}>
            13. Changes to Terms
          </h2>
          <p>
            We may modify these Terms at any time by posting the updated version on this page. Material changes will be
            communicated via email or in-app notification at least 30 days before taking effect. Your continued use of
            the Service after changes take effect constitutes acceptance.
          </p>

          <h2 className={h2} style={style}>
            14. Fundamental Constraints
          </h2>
          <p>
            At runpaperclip.com, we obey both the local laws and the laws of physics. The speed of light is 299,792,458
            meters per second. It is not just a good idea&mdash;it is the law.
          </p>
          <p>
            Any actions you take using the Service that violate either category of law&mdash;statutory or
            thermodynamic&mdash;are entirely your own responsibility. We are not gods. We cannot change the laws of
            physics, reverse entropy, or guarantee outcomes in a universe governed by quantum uncertainty.
          </p>
          <p>The Service is provided strictly at your own risk. Expect to be disappointed.</p>

          <h2 className={h2} style={style}>
            15. Contact
          </h2>
          <p>
            Questions about these Terms? Email{" "}
            <a href="mailto:legal@runpaperclip.com" className="text-indigo-400 no-underline hover:text-indigo-300">
              legal@runpaperclip.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
