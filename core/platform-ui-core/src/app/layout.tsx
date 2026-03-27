import { MotionConfig } from "framer-motion";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_URL } from "@/lib/api-config";
import { getBrandConfig } from "@/lib/brand-config";
import { TRPCProvider } from "@/lib/trpc";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const brand = getBrandConfig();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
    url: SITE_URL,
    images: [
      { url: "/og", width: 1200, height: 630, alt: `${brand.productName} — AI Agent Platform` },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.productName} — AI Agent Platform`,
    description: `${brand.tagline} ${brand.price ? `${brand.price}.` : ""} ${brand.domain}`,
    images: ["/og"],
  },
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;
  const initialTenantId = headersList.get("x-tenant-id") ?? "";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>{nonce && <meta property="csp-nonce" content={nonce} />}</head>
      <body className={`${jetbrainsMono.variable} antialiased`}>
        <MotionConfig nonce={nonce}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
            nonce={nonce}
          >
            <TRPCProvider initialTenantId={initialTenantId}>
              {children}
              <Toaster
                theme="dark"
                position="bottom-right"
                toastOptions={{
                  style: { maxWidth: "360px" },
                }}
              />
            </TRPCProvider>
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
