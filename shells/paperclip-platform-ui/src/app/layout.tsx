import { BrandHydrator } from "@core/components/brand-hydrator";
import { ThemeProvider } from "@core/components/theme-provider";
import { SITE_URL } from "@core/lib/api-config";
import { getBrandConfig, initBrandConfig } from "@core/lib/brand-config";
import { TRPCProvider } from "@core/lib/trpc";
import { MotionConfig } from "framer-motion";
import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

await initBrandConfig("paperclip");

const brand = getBrandConfig();

const seoTitle = "Paperclip — Deploy Your AI Workforce in Seconds";
const seoDescription =
  "AI agents that code, ship, and iterate while you sleep. Hire a CEO, build a team of specialists, and watch real work happen. $5 in free credits to start.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: seoTitle,
    template: `%s | Paperclip`,
  },
  description: seoDescription,
  openGraph: {
    type: "website",
    siteName: "Paperclip",
    title: seoTitle,
    description: seoDescription,
    url: SITE_URL,
    locale: "en_US",
    images: [
      {
        url: "/og",
        width: 1200,
        height: 630,
        alt: "Paperclip — Deploy your AI workforce",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: seoTitle,
    description: seoDescription,
    images: ["/og"],
    creator: "@runpaperclip",
  },
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
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
      <body className={`${jetbrainsMono.variable} ${spaceGrotesk.variable} ${dmSans.variable} antialiased`}>
        <MotionConfig nonce={nonce}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange nonce={nonce}>
            <TRPCProvider>
              <BrandHydrator config={brand} />
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
