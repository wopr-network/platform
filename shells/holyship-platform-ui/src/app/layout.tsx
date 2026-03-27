import { ThemeProvider } from "@core/components/theme-provider";
import { SITE_URL } from "@core/lib/api-config";
import { getBrandConfig, setBrandConfig } from "@core/lib/brand-config";
import { TRPCProvider } from "@core/lib/trpc";
import { MotionConfig } from "framer-motion";
import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-jetbrains-mono",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
});

setBrandConfig({
	productName: "Holy Ship",
	brandName: "Holy Ship",
	domains: [
		{ host: "holyship.wtf", role: "canonical" },
		{ host: "holyship.dev", role: "redirect" },
	],
	tagline: "It's what you'll say when you see the results.",
	storagePrefix: "holyship",
	homePath: "/dashboard",
	navItems: [
		{ label: "Dashboard", href: "/dashboard" },
		{ label: "Ship It", href: "/ship" },
		{ label: "Approvals", href: "/approvals" },
		{ label: "Pipeline", href: "/settings/pipeline" },
		{ label: "Billing", href: "/billing/plans" },
		{ label: "Settings", href: "/settings/profile" },
	],
});

const brand = getBrandConfig();

export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: `${brand.productName} — Guaranteed Code Shipping`,
		template: `%s | ${brand.brandName}`,
	},
	description: brand.tagline,
	openGraph: {
		type: "website",
		siteName: brand.brandName,
		title: `${brand.productName} — Guaranteed Code Shipping`,
		description: brand.tagline,
		url: SITE_URL,
		images: [{ url: "/og", width: 1200, height: 630, alt: brand.productName }],
	},
};

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const nonce = (await headers()).get("x-nonce") ?? undefined;
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{nonce && <meta property="csp-nonce" content={nonce} />}
				<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
				<link
					rel="icon"
					href="/favicon-16.svg"
					type="image/svg+xml"
					sizes="16x16"
				/>
				<meta name="theme-color" content="#0a0a0a" />
			</head>
			<body className={`${jetbrainsMono.variable} antialiased`}>
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
							<Toaster theme="dark" richColors />
						</TRPCProvider>
					</ThemeProvider>
				</MotionConfig>
			</body>
		</html>
	);
}
