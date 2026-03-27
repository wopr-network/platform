import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/pricing-page";
import { SITE_URL } from "@/lib/api-config";
import { getBrandConfig } from "@/lib/brand-config";

const brand = getBrandConfig();

export const metadata: Metadata = {
  title: `Pricing — ${brand.brandName} pays for itself`,
  description: `Every day, ${brand.brandName} distributes credits back to active users. The bigger the community grows, the more you receive. Early users get the most.`,
  openGraph: {
    title: `Pricing — ${brand.brandName} pays for itself`,
    description: `Every day, ${brand.brandName} distributes credits back to active users. The bigger the community grows, the more you receive.`,
    url: `${SITE_URL}/pricing`,
  },
};

export default async function Page() {
  return <PricingPage />;
}
