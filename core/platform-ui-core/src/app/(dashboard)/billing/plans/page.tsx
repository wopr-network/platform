import { Check } from "lucide-react";
import Link from "next/link";
import { BuyCreditsPanel } from "@/components/billing/buy-credits-panel";
import { CryptoCheckout } from "@/components/billing/crypto-checkout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrandConfig, productName } from "@/lib/brand-config";
import { pricingData } from "@/lib/pricing-data";

export default function PlansPage() {
  const { planFeatures } = getBrandConfig();
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Plan</h1>
        <p className="text-sm text-muted-foreground">Simple pricing. No tiers. No gotchas.</p>
      </div>

      <Card className="border-terminal shadow-[0_0_12px_rgba(0,255,65,0.15)]">
        <CardHeader className="text-center">
          <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">
            {productName()}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <p className="text-5xl font-bold text-terminal">
            ${pricingData.bot_price.amount}
            <span className="text-xl font-normal text-muted-foreground">
              /{pricingData.bot_price.period}
            </span>
          </p>
          <p className="text-muted-foreground">per bot</p>
          <ul className="space-y-2 text-sm">
            {planFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-muted-foreground">
                <Check className="size-4 shrink-0 text-terminal" />
                {feature}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Usage is billed from credits at transparent per-use rates.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/pricing">View full pricing</Link>
          </Button>
        </CardContent>
      </Card>

      <BuyCreditsPanel />
      <CryptoCheckout />
    </div>
  );
}
