import { BotIcon, ImageIcon, MicIcon, SmartphoneIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPublicPricing } from "@/lib/api";
import { brandName, getBrandConfig } from "@/lib/brand-config";
import { formatCreditDetailed } from "@/lib/format-credit";
import { mergeApiRates, type PricingCapability, pricingData } from "@/lib/pricing-data";
import { DividendCalculator } from "./dividend-calculator";
import { DividendStats } from "./dividend-stats";

const iconMap = {
  bot: BotIcon,
  mic: MicIcon,
  image: ImageIcon,
  smartphone: SmartphoneIcon,
} as const;

function formatPrice(price: number): string {
  return formatCreditDetailed(price);
}

export async function PricingPage() {
  let capabilities: PricingCapability[];
  const apiData = await fetchPublicPricing();
  if (apiData) {
    capabilities = mergeApiRates(apiData.rates);
  } else {
    capabilities = pricingData.capabilities.map((c) => ({
      category: c.category,
      icon: c.icon,
      models: c.models.map((m) => ({ name: m.name, unit: m.unit, price: m.price })),
    }));
  }

  return (
    <div className="bg-background text-foreground">
      {/* --- Dividend Hero --- */}
      <section className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <Badge variant="terminal" className="mb-8">
          Community dividend
        </Badge>

        <h1 className="max-w-3xl text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
          {brandName()} pays for itself.
        </h1>

        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Every day, the platform distributes credits back to active users from its own margin. The
          bigger the community grows, the more you receive. Early users get the most.
        </p>

        <p className="mt-4 max-w-lg text-sm text-muted-foreground">
          At scale, the daily dividend covers your entire credit spend. You&apos;re not paying to
          run your bots. {brandName()} is.
        </p>
      </section>

      {/* --- Live Pool Stats --- */}
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <DividendStats />
      </section>

      {/* --- Dividend Math --- */}
      <section className="px-6 pb-24">
        <DividendCalculator />
      </section>

      {/* --- Credit Tiers (reframed) --- */}
      <section className="flex flex-col items-center justify-center px-6 pb-12 text-center">
        <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">Stay in the pool.</h2>
        <p className="mb-8 max-w-lg text-muted-foreground">
          Your bot is{" "}
          <span className="font-semibold text-terminal">
            ${pricingData.bot_price.amount}/{pricingData.bot_price.period}
          </span>
          . That&apos;s the minimum to be eligible for the daily dividend. Usage is billed at cost
          from credits.
        </p>

        <Card className="w-full max-w-md border-terminal">
          <CardHeader className="items-center text-center">
            <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">
              Pool eligibility
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-5xl font-bold text-terminal sm:text-6xl" data-testid="bot-price">
              ${pricingData.bot_price.amount}
              <span className="text-xl font-normal text-muted-foreground">
                /{pricingData.bot_price.period}
              </span>
            </p>
            <p className="text-muted-foreground">Minimum spend to stay in the dividend pool.</p>
          </CardContent>
        </Card>
      </section>

      {/* --- Capability Pricing --- */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <h2 className="mb-12 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Usage rates. Nothing hidden.
        </h2>

        <div className="flex flex-col gap-12">
          {capabilities.map((capability) => {
            const Icon = iconMap[capability.icon];
            return (
              <div key={capability.category}>
                <div className="mb-4 flex items-center gap-3">
                  <Icon className="size-5 text-terminal" />
                  <h3 className="text-lg font-semibold">{capability.category}</h3>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {capability.models.map((model) => (
                    <Card key={model.name} className="border-border">
                      <CardContent className="flex items-center justify-between py-4">
                        <div>
                          <p className="font-medium">{model.name}</p>
                          <p className="text-sm text-muted-foreground">per {model.unit}</p>
                        </div>
                        <p className="text-lg font-bold text-terminal">
                          {formatPrice(model.price)}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* --- VPS Tier --- */}
      <section className="mx-auto max-w-4xl px-6 pb-24">
        <h2 className="mb-4 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Need a dedicated machine?
        </h2>
        <p className="mb-8 text-center text-muted-foreground">
          The VPS tier gives your bot a persistent container with fixed monthly pricing — no
          per-credit billing for compute.
        </p>
        <div className="mx-auto max-w-sm">
          <Card className="border-terminal/50">
            <CardHeader className="items-center text-center">
              <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">
                VPS tier
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <p className="text-5xl font-bold text-terminal sm:text-6xl">
                $15
                <span className="text-xl font-normal text-muted-foreground">/mo</span>
              </p>
              <ul className="w-full space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="text-terminal">✓</span> 2 GB RAM / 2 vCPU / 20 GB SSD
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal">✓</span> Persistent container — data survives
                  restarts
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal">✓</span> Dedicated hostname
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal">✓</span> SSH access via Cloudflare Tunnel
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-terminal">✓</span> Flat monthly price — no metered compute
                </li>
              </ul>
              <Button
                data-onboarding-id="pricing.subscribe.vps"
                variant="terminal"
                className="w-full"
                asChild
              >
                <Link href="/signup">Get started</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* --- Credits Explainer --- */}
      <section className="flex flex-col items-center justify-center gap-6 px-6 pb-24 text-center">
        <p className="max-w-lg text-lg text-muted-foreground">
          Your bot is ${pricingData.bot_price.amount}/mo. Usage is billed from credits. Free tier
          includes ${pricingData.signup_credit} signup credit.
        </p>
        <p className="text-sm text-muted-foreground">
          Credits in, dividend back. The community grows, your costs shrink.
        </p>
      </section>

      {/* --- CTA --- */}
      <section className="flex min-h-[40dvh] flex-col items-center justify-center gap-8 px-6 text-center">
        <h2 className="max-w-2xl text-2xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
          Join early. The math rewards you.
        </h2>

        <Button data-onboarding-id="pricing.subscribe.cta" variant="terminal" size="lg" asChild>
          <Link href="/signup">Get Started</Link>
        </Button>

        <span className="mt-4 text-sm text-muted-foreground opacity-60">
          {getBrandConfig().domain}
        </span>
      </section>

      {/* --- Footer --- */}
      <footer className="flex justify-center gap-6 px-6 pb-8 text-sm text-muted-foreground">
        <Link href="/" className="underline underline-offset-4 hover:text-foreground">
          Home
        </Link>
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          Terms
        </Link>
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
