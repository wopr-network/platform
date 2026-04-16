import { BrandHydrator } from "@core/components/brand-hydrator";
import { ThemeProvider } from "@core/components/theme-provider";
import { getBrandConfig, initBrandConfig } from "@core/lib/brand-config";
import { TRPCProvider } from "@core/lib/trpc";
import { MotionConfig } from "framer-motion";
import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

await initBrandConfig("nemoclaw");

const brand = getBrandConfig();
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${brand.domain}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${brand.productName} — AI Agent Platform`,
    template: `%s | ${brand.brandName}`,
  },
  description: `${brand.tagline} ${brand.price ? `${brand.price}.` : ""} ${brand.domain}`,
  openGraph: {
    type: "website",
    siteName: brand.brandName,
    title: `${brand.productName} — AI Agent Platform`,
    description: `${brand.tagline} ${brand.price ? `${brand.price}.` : ""} ${brand.domain}`,
    url: siteUrl,
    images: [
      {
        url: "/og",
        width: 1200,
        height: 630,
        alt: `${brand.productName} — AI Agent Platform`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.productName} — AI Agent Platform`,
    description: `${brand.tagline} ${brand.price ? `${brand.price}.` : ""} ${brand.domain}`,
    images: ["/og"],
  },
  alternates: {
    canonical: siteUrl,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon",
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>{nonce && <meta property="csp-nonce" content={nonce} />}</head>
      <body className={`${jetbrainsMono.variable} ${spaceGrotesk.variable} antialiased`}>
        <MotionConfig nonce={nonce}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange nonce={nonce}>
            <TRPCProvider>
              <BrandHydrator config={brand} />
              {children}
              <Toaster theme="dark" richColors />
            </TRPCProvider>
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
