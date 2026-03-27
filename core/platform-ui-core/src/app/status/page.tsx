import type { Metadata } from "next";
import { StatusPage } from "@/components/status/status-page";
import { SITE_URL } from "@/lib/api-config";
import { getBrandConfig } from "@/lib/brand-config";

const brand = getBrandConfig();

export const metadata: Metadata = {
  title: `Platform Status — ${brand.brandName}`,
  description: `Real-time health and uptime status for the ${brand.brandName} platform.`,
  openGraph: {
    title: `Platform Status — ${brand.brandName}`,
    description: `Real-time health and uptime status for the ${brand.brandName} platform.`,
    url: `${SITE_URL}/status`,
  },
};

export default function Page() {
  return <StatusPage />;
}
