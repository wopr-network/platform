import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Core Admin",
    template: "%s | Core Admin",
  },
  description: "Internal cross-product administration dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#0a0a0a" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body className={`${jetbrainsMono.variable} font-mono antialiased bg-neutral-950 text-neutral-100 min-h-screen`}>
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
        <Toaster theme="dark" richColors />
      </body>
    </html>
  );
}

function Nav() {
  return (
    <nav className="w-56 border-r border-neutral-800 bg-neutral-900/50 p-4 flex flex-col gap-1">
      <div className="text-sm font-semibold text-blue-400 mb-4 tracking-wide uppercase">Core Admin</div>
      <NavLink href="/">Dashboard</NavLink>
      <NavLink href="/tenants">Tenants</NavLink>
      <NavLink href="/billing">Billing</NavLink>
      <NavLink href="/fleet">Fleet</NavLink>
      <NavLink href="/products">Products</NavLink>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="block px-3 py-2 rounded-md text-sm text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
    >
      {children}
    </a>
  );
}
