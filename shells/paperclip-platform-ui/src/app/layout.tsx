import { ThemeProvider } from "@core/components/theme-provider";
import { SITE_URL } from "@core/lib/api-config";
import { getBrandConfig, setBrandConfig } from "@core/lib/brand-config";
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

setBrandConfig({
	homePath: "/instances",
	chatEnabled: false,
	navItems: [
		{ label: "Paperclips", href: "/instances" },
		{ label: "Billing", href: "/billing/plans" },
		{ label: "Settings", href: "/settings/profile" },
		{ label: "Admin", href: "/admin" },
	],
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
}: Readonly<{ children: React.ReactNode }>) {
	const nonce = (await headers()).get("x-nonce") ?? undefined;
	return (
		<html lang="en" suppressHydrationWarning>
			<head>{nonce && <meta property="csp-nonce" content={nonce} />}</head>
			<body
				className={`${jetbrainsMono.variable} ${spaceGrotesk.variable} ${dmSans.variable} antialiased`}
			>
				<MotionConfig nonce={nonce}>
					<ThemeProvider
						attribute="class"
						defaultTheme="dark"
						enableSystem
						disableTransitionOnChange
						nonce={nonce}
					>
						<TRPCProvider>
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
