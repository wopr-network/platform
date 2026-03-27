import { CreditCard, MessageSquare, Zap } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#f1f5f9]">
      {/* Nav */}
      <nav className="flex items-center px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#818cf8]" />
          <span className="text-lg font-semibold tracking-tight">NemoPod</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#76b900]/10 text-[#76b900] border border-[#76b900]/20">
            NVIDIA NeMo
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-6">
          <Link href="#features" className="text-sm text-[#94a3b8] hover:text-[#f1f5f9] transition-colors">
            Docs
          </Link>
          <Link href="/billing/plans" className="text-sm text-[#94a3b8] hover:text-[#f1f5f9] transition-colors">
            Pricing
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[#818cf8] text-white hover:bg-[#6366f1] transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-[#0a0f1a] to-[#09090b] px-6 py-24 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold tracking-widest uppercase text-[#818cf8] mb-4">AI Agent Platform</p>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
            NVIDIA NeMo,
            <br />
            <span className="text-[#818cf8]">one click away</span>
          </h1>
          <p className="text-lg text-[#94a3b8] mb-10 max-w-xl mx-auto leading-relaxed">
            Deploy NVIDIA NeMo agents instantly from a hot pool of pre-warmed containers. Chat, iterate, and ship — no
            infrastructure headaches.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="px-6 py-3 rounded-lg bg-[#818cf8] text-white font-medium hover:bg-[#6366f1] transition-colors"
            >
              Start Free
            </Link>
            <Link
              href="#features"
              className="px-6 py-3 rounded-lg border border-[#334155] text-[#94a3b8] font-medium hover:text-[#f1f5f9] hover:border-[#475569] transition-colors"
            >
              View Docs
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-20 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-[#818cf8]/10 flex items-center justify-center mb-4">
              <Zap className="w-5 h-5 text-[#818cf8]" />
            </div>
            <h3 className="text-base font-semibold text-[#f1f5f9] mb-2">Instant Deploy</h3>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              Hot pool of pre-warmed containers. Name it, claim it, chat with it. No cold starts.
            </p>
          </div>

          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-[#818cf8]/10 flex items-center justify-center mb-4">
              <MessageSquare className="w-5 h-5 text-[#818cf8]" />
            </div>
            <h3 className="text-base font-semibold text-[#f1f5f9] mb-2">Chat Interface</h3>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              Tab-based chat. Each agent has its own persistent conversation history.
            </p>
          </div>

          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6">
            <div className="w-10 h-10 rounded-lg bg-[#818cf8]/10 flex items-center justify-center mb-4">
              <CreditCard className="w-5 h-5 text-[#818cf8]" />
            </div>
            <h3 className="text-base font-semibold text-[#f1f5f9] mb-2">Pay Per Use</h3>
            <p className="text-sm text-[#94a3b8] leading-relaxed">
              $5 free credits on signup. Metered inference billing. No subscriptions, no surprises.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-10 border-t border-[#1e293b] text-center">
        <p className="text-sm text-[#64748b] mb-4">Built on enterprise-grade infrastructure</p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#76b900]/10 border border-[#76b900]/20">
          <div className="w-3 h-3 bg-[#76b900] rotate-45 rounded-sm" />
          <span className="text-xs font-medium text-[#76b900]">Powered by NVIDIA NeMo</span>
        </div>
      </footer>
    </div>
  );
}
