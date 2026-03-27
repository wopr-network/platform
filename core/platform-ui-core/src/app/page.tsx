import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { SITE_URL } from "@/lib/api-config";
import { getBrandConfig } from "@/lib/brand-config";

const brand = getBrandConfig();

const desc =
  brand.tagline || `A ${brand.price || "$5/month"} supercomputer that runs your business.`;

export const metadata: Metadata = {
  title: `${brand.productName} — ${brand.tagline}`,
  description: desc,
  openGraph: {
    title: `${brand.productName} — ${brand.tagline}`,
    description: desc,
    url: SITE_URL,
    siteName: brand.productName,
    type: "website",
    images: [
      {
        url: "/og",
        width: 1200,
        height: 630,
        alt: `${brand.productName} — ${brand.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.productName} — ${brand.tagline}`,
    description: desc,
    images: ["/og"],
  },
};

export default function Page() {
  return <LandingPage />;
}
